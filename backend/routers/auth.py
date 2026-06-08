from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
import uuid

import models, schemas, auth
from database import get_db
from dependencies import redis_client, oauth2_scheme

router = APIRouter(tags=["auth"])

@router.post("/signup", response_model=schemas.User)
def register(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # First user becomes owner, others become members
    is_first_user = db.query(models.User).count() == 0
    role = "owner" if is_first_user else "member"
    
    hashed_password = auth.get_password_hash(user.password)
    db_user = models.User(email=user.email, hashed_password=hashed_password, role=role)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

@router.post("/login", response_model=schemas.Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == form_data.username).first()
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Clear old session if it exists (Single session per user)
    old_token = redis_client.get(f"user_session:{user.email}")
    if old_token:
        redis_client.delete(f"session:{old_token}")
        
    session_token = str(uuid.uuid4())
    redis_client.setex(f"session:{session_token}", 86400, user.email) # 24 hour expiry
    redis_client.setex(f"user_session:{user.email}", 86400, session_token)
    
    return {"access_token": session_token, "token_type": "bearer"}

@router.post("/logout")
def logout(token: str = Depends(oauth2_scheme)):
    email = redis_client.get(f"session:{token}")
    if email:
        redis_client.delete(f"session:{token}")
        redis_client.delete(f"user_session:{email}")
        redis_client.delete(f"user:{email}")
    return {"ok": True}
