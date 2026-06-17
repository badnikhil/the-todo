import os
from celery import Celery
from datetime import datetime
from database import SessionLocal
from models import Todo, Notification
import redis
import json
from opentelemetry.instrumentation.celery import CeleryInstrumentor

redis_client = redis.Redis(host=os.getenv("REDIS_HOST", "localhost"), port=6379, db=0, decode_responses=True)

redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/1")

from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

celery_app = Celery(
    "worker",
    broker=redis_url,
    backend=redis_url
)

resource = Resource.create({"service.name": "todo-celery-worker"})
tracer_provider = TracerProvider(resource=resource)
trace.set_tracer_provider(tracer_provider)
otlp_endpoint = os.getenv("OTLP_HTTP_ENDPOINT", "http://127.0.0.1:4318/v1/traces")
otlp_exporter = OTLPSpanExporter(endpoint=otlp_endpoint)
tracer_provider.add_span_processor(BatchSpanProcessor(otlp_exporter))

CeleryInstrumentor().instrument()

celery_app.conf.beat_schedule = {
    'check-reminders-every-10-seconds': {
        'task': 'worker.check_reminders',
        'schedule': 10.0,
    },
}
celery_app.conf.timezone = 'UTC'

@celery_app.task
def check_reminders():
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        overdue_todos = db.query(Todo).filter(Todo.completed == False, Todo.due_date <= now).all()
        
        if not overdue_todos:
            print(f"[{now.strftime('%H:%M:%S')}] Checked for reminders... All caught up!")
            return
            
        for todo in overdue_todos:
            # Check if we already notified for this todo
            notified_key = f"notified:todo:{todo.id}"
            if redis_client.get(notified_key):
                continue

            msg = f"[{now.strftime('%H:%M:%S')}]  REMINDER: Todo '{todo.title}' is OVERDUE! (Due: {todo.due_date})"
            print(msg)
            
            # Phase 13: Save to DB and publish to Redis
            if todo.owner and todo.owner.email:
                message_text = f"Reminder: '{todo.title}' is overdue!"
                

                
                # Save to Database
                new_notification = Notification(
                    message=message_text,
                    user_id=todo.owner_id
                )
                db.add(new_notification)
                db.commit()
                db.refresh(new_notification)

                notification = {
                    "type": "notification",
                    "email": todo.owner.email,
                    "id": new_notification.id,
                    "message": message_text,
                    "is_read": False
                }
                redis_client.publish("notifications", json.dumps(notification))
                
            # Mark as notified for 24 hours (86400 seconds)
            redis_client.setex(notified_key, 86400, "1")
            
    finally:
        db.close()
