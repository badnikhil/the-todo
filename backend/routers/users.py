from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List
import uuid
import shutil

import models, schemas
from database import get_db
from dependencies import get_current_user, RoleChecker, redis_client

router = APIRouter(prefix="/users", tags=["users"])

@router.get("/me", response_model=schemas.User)
def read_users_me(current_user: models.User = Depends(get_current_user)):
    return current_user

@router.post("/me/profile_picture", response_model=schemas.User)
def upload_profile_picture(file: UploadFile = File(...), db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    ext = file.filename.split(".")[-1]
    filename = f"{uuid.uuid4()}.{ext}"
    filepath = f"uploads/profiles/{filename}"
    
    with open(filepath, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    db_user = db.query(models.User).filter(models.User.id == current_user.id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
        
    db_user.profile_picture_url = f"/{filepath}"
    db.commit()
    db.refresh(db_user)
    
    redis_client.hset(f"user:{db_user.email}", "profile_picture_url", db_user.profile_picture_url)
    
    return db_user

@router.get("/", response_model=List[schemas.User])
def get_all_users(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: models.User = Depends(RoleChecker(["admin", "owner"]))):
    return db.query(models.User).offset(skip).limit(limit).all()

@router.put("/{user_id}/role", response_model=schemas.User)
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
    
    redis_client.hset(f"user:{db_user.email}", "role", db_user.role)
    
    return db_user

@router.delete("/{user_id}")
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
    session_token = redis_client.get(f"user_session:{email}")
    if session_token:
        redis_client.delete(f"session:{session_token}")
        redis_client.delete(f"user_session:{email}")
    
    return {"ok": True}
