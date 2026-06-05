from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List

# --- USERS ---
class UserBase(BaseModel):
    # Enforces a valid email format
    email: EmailStr

class UserCreate(UserBase):
    # Enforces password length
    password: str = Field(..., min_length=8, description="Password must be at least 8 characters long")

class User(UserBase):
    id: int
    is_active: bool
    role: str

    class Config:
        from_attributes = True

class RoleUpdate(BaseModel):
    # Validates that the role is one of the allowed strings
    role: str = Field(..., pattern="^(owner|admin|member)$", description="Role must be owner, admin, or member")

# --- PROJECTS ---
class ProjectBase(BaseModel):
    # Enforces that a project title is at least 1 character (no empty strings) and max 100
    title: str = Field(..., min_length=1, max_length=100, description="Title is required")
    # Optional description with max length
    description: Optional[str] = Field(None, max_length=500)

    @field_validator('title')
    def title_must_not_be_whitespace(cls, v):
        if not v.strip():
            raise ValueError('Title must not be empty or just whitespace')
        return v

class ProjectCreate(ProjectBase):
    pass

class ProjectUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)

class Project(ProjectBase):
    id: int
    owner_id: int

    class Config:
        from_attributes = True

# --- TODOS ---
class TodoBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    completed: bool = False
    project_id: Optional[int] = None

    @field_validator('title')
    def title_must_not_be_whitespace(cls, v):
        if not v.strip():
            raise ValueError('Title must not be empty or just whitespace')
        return v

class TodoCreate(TodoBase):
    pass

class TodoUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    completed: Optional[bool] = None
    project_id: Optional[int] = None

class Todo(TodoBase):
    id: int
    owner_id: Optional[int] = None

    class Config:
        from_attributes = True
