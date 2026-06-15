from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List, Optional
import uuid
import shutil

import models, schemas
from database import get_db
from dependencies import get_current_user, RateLimiter
from websocket import broadcast_stats, broadcast_activity

router = APIRouter(prefix="/todos", tags=["todos"])

@router.post("/", response_model=schemas.Todo)
def create_todo(todo: schemas.TodoCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: models.User = Depends(RateLimiter(requests=10, window=60))):
    todo_data = todo.model_dump()
    todo_data["owner_id"] = current_user.id
    db_todo = models.Todo(**todo_data)
    db.add(db_todo)
    db.commit()
    db.refresh(db_todo)
    
    db_activity = models.Activity(action="Todo Created", entity_name=db_todo.title, user_id=current_user.id, todo_id=db_todo.id)
    db.add(db_activity)
    db.commit()
    db.refresh(db_activity)
    background_tasks.add_task(broadcast_activity, {
        "id": db_activity.id,
        "action": db_activity.action,
        "entity_name": db_activity.entity_name,
        "created_at": db_activity.created_at.isoformat() + "Z" if db_activity.created_at else None,
        "user_id": db_activity.user_id,
        "todo_id": db_activity.todo_id,
        "project_id": db_activity.project_id,
        "user": {"email": current_user.email}
    })
    
    total_todos = db.query(models.Todo).count()
    background_tasks.add_task(broadcast_stats, total_todos=total_todos)
    
    return db_todo

@router.get("/", response_model=List[schemas.Todo])
def read_todos(q: Optional[str] = None, skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    query = db.query(models.Todo).filter(models.Todo.owner_id == current_user.id)
    if q:
        search_pattern = f"%{q}%"
        query = query.filter(
            or_(
                models.Todo.title.ilike(search_pattern),
                models.Todo.description.ilike(search_pattern)
            )
        )
    return query.order_by(models.Todo.id.desc()).offset(skip).limit(limit).all()

@router.put("/{todo_id}", response_model=schemas.Todo)
def update_todo(todo_id: int, todo_update: schemas.TodoUpdate, background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_todo = db.query(models.Todo).filter(models.Todo.id == todo_id, models.Todo.owner_id == current_user.id).first()
    if db_todo is None:
        raise HTTPException(status_code=404, detail="Todo not found")
    
    update_data = todo_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_todo, key, value)
        
    db.commit()
    db.refresh(db_todo)
    
    db_activity = models.Activity(action="Todo Updated", entity_name=db_todo.title, user_id=current_user.id, todo_id=db_todo.id)
    db.add(db_activity)
    db.commit()
    db.refresh(db_activity)
    background_tasks.add_task(broadcast_activity, {
        "id": db_activity.id,
        "action": db_activity.action,
        "entity_name": db_activity.entity_name,
        "created_at": db_activity.created_at.isoformat() + "Z" if db_activity.created_at else None,
        "user_id": db_activity.user_id,
        "todo_id": db_activity.todo_id,
        "project_id": db_activity.project_id,
        "user": {"email": current_user.email}
    })
    
    return db_todo

@router.delete("/{todo_id}")
def delete_todo(todo_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_todo = db.query(models.Todo).filter(models.Todo.id == todo_id, models.Todo.owner_id == current_user.id).first()
    if db_todo is None:
        raise HTTPException(status_code=404, detail="Todo not found")
    
    todo_title = db_todo.title
    
    db.delete(db_todo)
    db.commit()
    
    db_activity = models.Activity(action="Todo Deleted", entity_name=todo_title, user_id=current_user.id, todo_id=None)
    db.add(db_activity)
    db.commit()
    db.refresh(db_activity)
    background_tasks.add_task(broadcast_activity, {
        "id": db_activity.id,
        "action": db_activity.action,
        "entity_name": db_activity.entity_name,
        "created_at": db_activity.created_at.isoformat() + "Z" if db_activity.created_at else None,
        "user_id": db_activity.user_id,
        "todo_id": db_activity.todo_id,
        "project_id": db_activity.project_id,
        "user": {"email": current_user.email}
    })
    
    total_todos = db.query(models.Todo).count()
    background_tasks.add_task(broadcast_stats, total_todos=total_todos)
    
    return {"ok": True}

@router.post("/{todo_id}/complete", response_model=schemas.Todo)
def complete_todo(todo_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_todo = db.query(models.Todo).filter(models.Todo.id == todo_id, models.Todo.owner_id == current_user.id).first()
    if db_todo is None:
        raise HTTPException(status_code=404, detail="Todo not found")
    
    db_todo.completed = True
    db.commit()
    db.refresh(db_todo)
    
    db_activity = models.Activity(action="Todo Completed", entity_name=db_todo.title, user_id=current_user.id, todo_id=db_todo.id)
    db.add(db_activity)
    db.commit()
    db.refresh(db_activity)
    background_tasks.add_task(broadcast_activity, {
        "id": db_activity.id,
        "action": db_activity.action,
        "entity_name": db_activity.entity_name,
        "created_at": db_activity.created_at.isoformat() + "Z" if db_activity.created_at else None,
        "user_id": db_activity.user_id,
        "todo_id": db_activity.todo_id,
        "project_id": db_activity.project_id,
        "user": {"email": current_user.email}
    })
    
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
