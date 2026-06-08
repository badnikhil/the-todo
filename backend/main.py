from fastapi import FastAPI, Depends, HTTPException, status, Request, WebSocket, WebSocketDisconnect, BackgroundTasks
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List

from database import get_db, engine, Base
import models
import schemas
import auth
import os
import shutil
import uuid
from fastapi.staticfiles import StaticFiles
from fastapi import UploadFile, File
import redis
import redis.asyncio as redis_async
import json
import asyncio

redis_client = redis.Redis(host=os.getenv("REDIS_HOST", "localhost"), port=6379, db=0, decode_responses=True)

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

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")
 
class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[WebSocket, str] = {}

    async def connect(self, websocket: WebSocket, email: str):
        await websocket.accept()
        self.active_connections[websocket] = email

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            del self.active_connections[websocket]

    async def broadcast(self, message: dict):
        for connection in list(self.active_connections.keys()):
            try:
                await connection.send_json(message)
            except:
                pass

    async def send_personal_message(self, message: dict, email: str):
        for connection, conn_email in self.active_connections.items():
            if conn_email == email:
                try:
                    await connection.send_json(message)
                except:
                    pass

manager = ConnectionManager()

async def redis_listener():
    r = redis_async.Redis(host=os.getenv("REDIS_HOST", "localhost"), port=6379, db=0, decode_responses=True)
    pubsub = r.pubsub()
    await pubsub.subscribe("notifications")
    async for message in pubsub.listen():
        if message["type"] == "message":
            try:
                data = json.loads(message["data"])
                await manager.send_personal_message(data, data["email"])
            except Exception as e:
                print(f"Error processing notification: {e}")

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(redis_listener())

async def broadcast_stats(total_todos: int = None, total_projects: int = None):
    msg = {"type": "stats_update"}
    if total_todos is not None:
        msg["total_todos"] = total_todos
    if total_projects is not None:
        msg["total_projects"] = total_projects
    await manager.broadcast(msg)

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

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    # Verify session token in Redis
    email = redis_client.get(f"session:{token}")
    if not email:
        raise credentials_exception
        
    # Check cache (Cache-aside pattern)
    cached_user = redis_client.hgetall(f"user:{email}")
    if cached_user:
        cached_user["id"] = int(cached_user["id"])
        cached_user["is_active"] = cached_user["is_active"] == "True"
        if cached_user.get("profile_picture_url") == "":
            cached_user["profile_picture_url"] = None
        return models.User(**cached_user)
        
    user = db.query(models.User).filter(models.User.email == email).first()
    if user is None:
        raise credentials_exception
        
    # Set cache with TTL
    user_dict = {
        "id": str(user.id),
        "email": user.email,
        "is_active": str(user.is_active),
        "role": user.role,
        "profile_picture_url": user.profile_picture_url or "",
        "hashed_password": user.hashed_password
    }
    redis_client.hset(f"user:{email}", mapping=user_dict)
    redis_client.expire(f"user:{email}", 3600)

    
    return user

# --- PHASE 5: RBAC Middleware ---
class RoleChecker:
    def __init__(self, allowed_roles: List[str]):
        self.allowed_roles = allowed_roles

    def __call__(self, user: models.User = Depends(get_current_user)):
        if user.role not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Operation not permitted. Required role: {self.allowed_roles}"
            )
        return user

# --- PHASE 10: Rate Limiting ---
class RateLimiter:
    def __init__(self, requests: int = 10, window: int = 60):
        self.requests = requests
        self.window = window

    def __call__(self, request: Request, current_user: models.User = Depends(get_current_user)):
        # Distributed rate limiting using Redis Fixed Window
        key = f"rate_limit:{current_user.email}:{request.url.path}"
        current = redis_client.incr(key)
        if current == 1:
            redis_client.expire(key, self.window)
        if current > self.requests:
            raise HTTPException(status_code=429, detail="Too many requests. Please slow down.")
        return current_user

@app.get("/health")
def health_check(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}
    except Exception as e:
        return {"status": "error", "database": str(e)}

# --- AUTH & USERS ---
@app.post("/signup", response_model=schemas.User)
def signup(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_password = auth.get_password_hash(user.password)
    new_user = models.User(email=user.email, hashed_password=hashed_password)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@app.post("/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == form_data.username).first()
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    
    # Create an opaque session token and store in Redis
    session_token = str(uuid.uuid4())
    redis_client.setex(f"session:{session_token}", 86400, user.email)  # 1 day TTL
    return {"access_token": session_token, "token_type": "bearer"}

@app.post("/logout")
def logout(token: str = Depends(oauth2_scheme)):
    redis_client.delete(f"session:{token}")
    return {"ok": True}

@app.get("/users/me", response_model=schemas.User)
def read_users_me(current_user: models.User = Depends(get_current_user)):
    return current_user

# Admin-only endpoint
@app.get("/users/", response_model=List[schemas.User])
def read_all_users(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: models.User = Depends(RoleChecker(["admin", "owner"]))):
    return db.query(models.User).offset(skip).limit(limit).all()

@app.post("/users/me/profile_picture", response_model=schemas.User)
def upload_profile_picture(file: UploadFile = File(...), db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    ext = file.filename.split(".")[-1]
    filename = f"{uuid.uuid4()}.{ext}"
    filepath = f"uploads/profiles/{filename}"
    
    with open(filepath, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    current_user.profile_picture_url = f"/{filepath}"
    db.commit()
    db.refresh(current_user)
    
    # Update cache field directly
    redis_client.hset(f"user:{current_user.email}", "profile_picture_url", current_user.profile_picture_url)
    
    return current_user

# Superadmin-only endpoint
@app.delete("/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(RoleChecker(["owner"]))):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if db_user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    email = db_user.email
    db.delete(db_user)
    db.commit()
    
    # Invalidate cache
    redis_client.delete(f"user:{email}")
    
    return {"ok": True}

@app.put("/users/{user_id}/role", response_model=schemas.User)
def update_user_role(user_id: int, role_update: schemas.RoleUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(RoleChecker(["owner"]))):
    if role_update.role not in ["owner", "admin", "member"]:
        raise HTTPException(status_code=400, detail="Invalid role")
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if db_user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot change your own role this way")
        
    db_user.role = role_update.role
    db.commit()
    db.refresh(db_user)
    
    # Update cache field directly
    redis_client.hset(f"user:{db_user.email}", "role", db_user.role)
    
    return db_user

# --- PROJECTS ---
@app.post("/projects/", response_model=schemas.Project)
def create_project(project: schemas.ProjectCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: models.User = Depends(RateLimiter(requests=5, window=60))):
    # Override owner_id to be current authenticated user
    project_data = project.model_dump()
    project_data["owner_id"] = current_user.id
    db_project = models.Project(**project_data)
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    
    # Broadcast new count
    total_projects = db.query(models.Project).count()
    background_tasks.add_task(broadcast_stats, total_projects=total_projects)
    
    return db_project

@app.get("/projects/", response_model=List[schemas.Project])
def read_projects(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return db.query(models.Project).filter(models.Project.owner_id == current_user.id).offset(skip).limit(limit).all()

@app.put("/projects/{project_id}", response_model=schemas.Project)
def update_project(project_id: int, project_update: schemas.ProjectUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_project = db.query(models.Project).filter(models.Project.id == project_id, models.Project.owner_id == current_user.id).first()
    if db_project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    
    update_data = project_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_project, key, value)
        
    db.commit()
    db.refresh(db_project)
    return db_project

@app.delete("/projects/{project_id}")
def delete_project(project_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_project = db.query(models.Project).filter(models.Project.id == project_id, models.Project.owner_id == current_user.id).first()
    if db_project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Delete all todos inside this project
    db.query(models.Todo).filter(models.Todo.project_id == project_id).delete()
    
    db.delete(db_project)
    db.commit()
    
    # Broadcast new counts
    total_projects = db.query(models.Project).count()
    total_todos = db.query(models.Todo).count()
    background_tasks.add_task(broadcast_stats, total_todos=total_todos, total_projects=total_projects)
    
    return {"ok": True}

# --- TODOS ---
@app.post("/todos/", response_model=schemas.Todo)
def create_todo(todo: schemas.TodoCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: models.User = Depends(RateLimiter(requests=10, window=60))):
    todo_data = todo.model_dump()
    todo_data["owner_id"] = current_user.id
    db_todo = models.Todo(**todo_data)
    db.add(db_todo)
    db.commit()
    db.refresh(db_todo)
    
    # Broadcast new count
    total_todos = db.query(models.Todo).count()
    background_tasks.add_task(broadcast_stats, total_todos=total_todos)
    
    return db_todo

@app.get("/todos/", response_model=List[schemas.Todo])
def read_todos(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return db.query(models.Todo).filter(models.Todo.owner_id == current_user.id).order_by(models.Todo.id.desc()).offset(skip).limit(limit).all()

@app.put("/todos/{todo_id}", response_model=schemas.Todo)
def update_todo(todo_id: int, todo_update: schemas.TodoUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_todo = db.query(models.Todo).filter(models.Todo.id == todo_id, models.Todo.owner_id == current_user.id).first()
    if db_todo is None:
        raise HTTPException(status_code=404, detail="Todo not found")
    
    update_data = todo_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_todo, key, value)
        
    db.commit()
    db.refresh(db_todo)
    return db_todo

@app.delete("/todos/{todo_id}")
def delete_todo(todo_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_todo = db.query(models.Todo).filter(models.Todo.id == todo_id, models.Todo.owner_id == current_user.id).first()
    if db_todo is None:
        raise HTTPException(status_code=404, detail="Todo not found")
    
    db.delete(db_todo)
    db.commit()
    
    # Broadcast new count
    total_todos = db.query(models.Todo).count()
    background_tasks.add_task(broadcast_stats, total_todos=total_todos)
    
    return {"ok": True}

@app.post("/todos/{todo_id}/complete", response_model=schemas.Todo)
def complete_todo(todo_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_todo = db.query(models.Todo).filter(models.Todo.id == todo_id, models.Todo.owner_id == current_user.id).first()
    if db_todo is None:
        raise HTTPException(status_code=404, detail="Todo not found")
    
    db_todo.completed = True
    db.commit()
    db.refresh(db_todo)
    return db_todo

@app.post("/todos/{todo_id}/attachment", response_model=schemas.Todo)
def upload_todo_attachment(todo_id: int, file: UploadFile = File(...), db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_todo = db.query(models.Todo).filter(models.Todo.id == todo_id, models.Todo.owner_id == current_user.id).first()
    if not db_todo:
        raise HTTPException(status_code=404, detail="Todo not found")
        
    ext = file.filename.split(".")[-1]
    filename = f"{uuid.uuid4()}.{ext}"
    filepath = f"uploads/todos/{filename}"
    
    with open(filepath, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    db_todo.attachment_url = f"/{filepath}"
    db.commit()
    db.refresh(db_todo)
    return db_todo

# --- NOTIFICATIONS ---
@app.get("/notifications/", response_model=List[schemas.NotificationOut])
def get_notifications(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return db.query(models.Notification).filter(models.Notification.user_id == current_user.id).order_by(models.Notification.created_at.desc()).all()

@app.post("/notifications/{notification_id}/read", response_model=schemas.NotificationOut)
def read_notification(notification_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_notification = db.query(models.Notification).filter(models.Notification.id == notification_id, models.Notification.user_id == current_user.id).first()
    if not db_notification:
        raise HTTPException(status_code=404, detail="Notification not found")
        
    db_notification.is_read = True
    db.commit()
    db.refresh(db_notification)
    return db_notification
