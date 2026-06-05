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
    role: str

    class Config:
        from_attributes = True

class RoleUpdate(BaseModel):
    role: str

# --- PROJECTS ---
class ProjectBase(BaseModel):
    title: str
    description: Optional[str] = None
# project base is same as project. Maybe in Future we may require it. Following High quality code practices
class ProjectCreate(ProjectBase):
    pass

class ProjectUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None

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
