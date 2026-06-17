import logging
import logging_loki
import structlog
from asgi_correlation_id import correlation_id
import os

def add_correlation_id(logger, method_name, event_dict):
    req_id = correlation_id.get()
    if req_id:
        event_dict["correlation_id"] = req_id
    return event_dict

def setup_logging():
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.stdlib.add_log_level,
            structlog.stdlib.add_logger_name,
            add_correlation_id,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer()
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )
    
    # Optional: configure stdlib logging to pass to structlog
    # Actually, to integrate nicely with FastAPI/Uvicorn, we set the root logger level.
    logging.basicConfig(level=logging.INFO)

    loki_url = os.getenv("LOKI_URL", "http://localhost:3100/loki/api/v1/push")
    loki_handler = logging_loki.LokiHandler(
        url=loki_url,
        tags={"application": "todo-backend"},
        version="1",
    )
    logging.getLogger("").addHandler(loki_handler)

logger = structlog.get_logger()
