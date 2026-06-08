from fastapi import FastAPI, Depends, status, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text
import os
import asyncio
from fastapi.staticfiles import StaticFiles

from database import get_db, engine
import models
from dependencies import redis_client
from websocket import manager, broadcast_stats, redis_listener

from routers import auth, users, projects, todos, notifications

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

# Include Routers
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(projects.router)
app.include_router(todos.router)
app.include_router(notifications.router)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(redis_listener())

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str, db: Session = Depends(get_db)):
    email = redis_client.get(f"session:{token}")
    if not email:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
        
    await manager.connect(websocket, email)
    
    total_todos = db.query(models.Todo).count()
    total_projects = db.query(models.Project).count()
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
