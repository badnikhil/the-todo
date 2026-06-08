from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from typing import List
import os
import redis

from database import get_db
import models

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/login")
redis_client = redis.Redis(host=os.getenv("REDIS_HOST", "localhost"), port=6379, db=0, decode_responses=True)

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    email = redis_client.get(f"session:{token}")
    if not email:
        raise credentials_exception
        
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

class RateLimiter:
    def __init__(self, requests: int = 10, window: int = 60):
        self.requests = requests
        self.window = window

    def __call__(self, request: Request, current_user: models.User = Depends(get_current_user)):
        key = f"rate_limit:{current_user.email}:{request.url.path}"
        current = redis_client.incr(key)
        if current == 1:
            redis_client.expire(key, self.window)
        if current > self.requests:
            raise HTTPException(status_code=429, detail="Too many requests. Please slow down.")
        return current_user
