from pydantic import BaseModel
from typing import Optional, List

# --- USERS ---
class UserBase(BaseModel):
    email: str

class UserCreate(UserBase):
    password: str

class User(UserBase):
    id: int
    is_active: bool

    class Config:
        from_attributes = True

# --- PROJECTS ---
class ProjectBase(BaseModel):
    title: str
    description: Optional[str] = None

class ProjectCreate(ProjectBase):
    owner_id: int

class Project(ProjectBase):
    id: int
    owner_id: int

    class Config:
        from_attributes = True

# --- TODOS ---
class TodoBase(BaseModel):
    title: str
    description: Optional[str] = None
    completed: bool = False
    project_id: Optional[int] = None

class TodoCreate(TodoBase):
    owner_id: Optional[int] = None

class TodoUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    completed: Optional[bool] = None
    project_id: Optional[int] = None

class Todo(TodoBase):
    id: int
    owner_id: Optional[int] = None

    class Config:
        from_attributes = True
