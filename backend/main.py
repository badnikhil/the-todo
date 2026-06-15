from fastapi import FastAPI, Depends, status, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from asgi_correlation_id import CorrelationIdMiddleware
import time
from logger import setup_logging, logger

setup_logging()
from sqlalchemy.orm import Session
from sqlalchemy import text
import os
import asyncio
from fastapi.concurrency import run_in_threadpool
from fastapi.staticfiles import StaticFiles

from database import get_db, engine
import models
from dependencies import redis_client
from websocket import manager, broadcast_stats, redis_listener

from routers import auth, users, projects, todos, notifications, activities

# Create database tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Todo API")

# Setup upload directories
os.makedirs("uploads/profiles", exist_ok=True)
os.makedirs("uploads/todos", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("FRONTEND_URLS", "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(CorrelationIdMiddleware)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    logger.info("request_started", method=request.method, url=str(request.url))
    
    try:
        response = await call_next(request)
        process_time = time.time() - start_time
        logger.info("request_finished", method=request.method, url=str(request.url), status_code=response.status_code, process_time=process_time)
        return response
    except Exception as e:
        process_time = time.time() - start_time
        logger.error("request_failed", method=request.method, url=str(request.url), error=str(e), process_time=process_time)
        raise

# Include Routers
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(projects.router)
app.include_router(todos.router)
app.include_router(notifications.router)
app.include_router(activities.router)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(redis_listener())

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str, db: Session = Depends(get_db)):
    email = await run_in_threadpool(redis_client.get, f"session:{token}")
    if not email:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
        
    await manager.connect(websocket, email)
    
    total_todos = await run_in_threadpool(db.query(models.Todo).count)
    total_projects = await run_in_threadpool(db.query(models.Project).count)
    online_users = list(set(manager.active_connections.values()))
    
    await manager.broadcast({
        "type": "init",
        "online_users": online_users,
        "total_todos": total_todos,
        "total_projects": total_projects
    })
    
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        online_users = list(set(manager.active_connections.values()))
        await manager.broadcast({
            "type": "presence",
            "online_users": online_users
        })

@app.get("/health")
def health_check(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}
    except Exception as e:
        return {"status": "error", "message": str(e)}
