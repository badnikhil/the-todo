from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File
from sqlalchemy.orm import Session
from typing import List
import uuid
import shutil

import models, schemas
from database import get_db
from dependencies import get_current_user, RateLimiter
from websocket import broadcast_stats

router = APIRouter(prefix="/todos", tags=["todos"])

@router.post("/", response_model=schemas.Todo)
def create_todo(todo: schemas.TodoCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: models.User = Depends(RateLimiter(requests=10, window=60))):
    todo_data = todo.model_dump()
    todo_data["owner_id"] = current_user.id
    db_todo = models.Todo(**todo_data)
    db.add(db_todo)
    db.commit()
    db.refresh(db_todo)
    
    total_todos = db.query(models.Todo).count()
    background_tasks.add_task(broadcast_stats, total_todos=total_todos)
    
    return db_todo

@router.get("/", response_model=List[schemas.Todo])
def read_todos(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return db.query(models.Todo).filter(models.Todo.owner_id == current_user.id).order_by(models.Todo.id.desc()).offset(skip).limit(limit).all()

@router.put("/{todo_id}", response_model=schemas.Todo)
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

@router.delete("/{todo_id}")
def delete_todo(todo_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_todo = db.query(models.Todo).filter(models.Todo.id == todo_id, models.Todo.owner_id == current_user.id).first()
    if db_todo is None:
        raise HTTPException(status_code=404, detail="Todo not found")
    
    db.delete(db_todo)
    db.commit()
    
    total_todos = db.query(models.Todo).count()
    background_tasks.add_task(broadcast_stats, total_todos=total_todos)
    
    return {"ok": True}

@router.post("/{todo_id}/complete", response_model=schemas.Todo)
def complete_todo(todo_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_todo = db.query(models.Todo).filter(models.Todo.id == todo_id, models.Todo.owner_id == current_user.id).first()
    if db_todo is None:
        raise HTTPException(status_code=404, detail="Todo not found")
    
    db_todo.completed = True
    db.commit()
    db.refresh(db_todo)
    return db_todo

@router.post("/{todo_id}/attachment", response_model=schemas.Todo)
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
