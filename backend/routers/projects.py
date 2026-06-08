from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List

import models, schemas
from database import get_db
from dependencies import get_current_user, RateLimiter
from websocket import broadcast_stats

router = APIRouter(prefix="/projects", tags=["projects"])

@router.post("/", response_model=schemas.Project)
def create_project(project: schemas.ProjectCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: models.User = Depends(RateLimiter(requests=5, window=60))):
    project_data = project.model_dump()
    project_data["owner_id"] = current_user.id
    db_project = models.Project(**project_data)
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    
    total_projects = db.query(models.Project).count()
    background_tasks.add_task(broadcast_stats, total_projects=total_projects)
    
    return db_project

@router.get("/", response_model=List[schemas.Project])
def read_projects(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return db.query(models.Project).filter(models.Project.owner_id == current_user.id).order_by(models.Project.id.desc()).offset(skip).limit(limit).all()

@router.put("/{project_id}", response_model=schemas.Project)
def update_project(project_id: int, project: schemas.ProjectUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_project = db.query(models.Project).filter(models.Project.id == project_id, models.Project.owner_id == current_user.id).first()
    if db_project is None:
        raise HTTPException(status_code=404, detail="Project not found")
        
    for key, value in project.model_dump(exclude_unset=True).items():
        setattr(db_project, key, value)
        
    db.commit()
    db.refresh(db_project)
    return db_project

@router.delete("/{project_id}")
def delete_project(project_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_project = db.query(models.Project).filter(models.Project.id == project_id, models.Project.owner_id == current_user.id).first()
    if db_project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Cascade delete all todos inside this project
    db.query(models.Todo).filter(models.Todo.project_id == project_id).delete()
    
    db.delete(db_project)
    db.commit()
    
    total_projects = db.query(models.Project).count()
    total_todos = db.query(models.Todo).count()
    background_tasks.add_task(broadcast_stats, total_todos=total_todos, total_projects=total_projects)
    
    return {"ok": True}
