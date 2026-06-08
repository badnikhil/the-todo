from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

import models, schemas
from database import get_db
from dependencies import get_current_user

router = APIRouter(prefix="/notifications", tags=["notifications"])

@router.get("/", response_model=List[schemas.NotificationOut])
def get_notifications(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return db.query(models.Notification).filter(models.Notification.user_id == current_user.id).order_by(models.Notification.created_at.desc()).all()

@router.post("/{notification_id}/read", response_model=schemas.NotificationOut)
def read_notification(notification_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_notification = db.query(models.Notification).filter(models.Notification.id == notification_id, models.Notification.user_id == current_user.id).first()
    if not db_notification:
        raise HTTPException(status_code=404, detail="Notification not found")
        
    db_notification.is_read = True
    db.commit()
    db.refresh(db_notification)
    return db_notification
