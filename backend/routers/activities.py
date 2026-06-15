from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List

import models, schemas
from database import get_db
from dependencies import get_current_user

router = APIRouter(prefix="/activities", tags=["activities"])

from sqlalchemy.orm import joinedload

@router.get("/", response_model=List[schemas.ActivityOut])
def get_activities(skip: int = 0, limit: int = 50, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return db.query(models.Activity).options(joinedload(models.Activity.user)).order_by(models.Activity.created_at.desc()).offset(skip).limit(limit).all()
