from fastapi import FastAPI, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from database import get_db, engine, Base
import os

# Base.metadata.create_all(bind=engine) # Optional: create tables on startup

app = FastAPI(title="Todo API")

@app.get("/")
def read_root():
    return {"message": "Hello World"}

@app.get("/health")
def health_check(db: Session = Depends(get_db)):
    try:
        # Try to execute a simple query to check the database connection
        db.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}
    except Exception as e:
        return {"status": "error", "database": str(e)}
