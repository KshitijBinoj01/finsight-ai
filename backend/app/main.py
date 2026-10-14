from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from app.config import settings
from app.database import engine
from app import models
from app.routers import auth, transactions, budgets, goals, insights

app = FastAPI(
    title="FinSight AI API",
    description="Backend API for the FinSight AI DBMS mini-project.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(transactions.router)
app.include_router(budgets.router)
app.include_router(goals.router)
app.include_router(insights.router)


@app.get("/")
def root():
    return {"name": "FinSight AI API", "docs": "/docs", "health": "/health"}


@app.get("/health")
def health():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}
    except Exception:
        return {"status": "error", "database": "unavailable"}


@app.on_event("startup")
def check_schema():
    # Intentionally does NOT create/alter tables. Run the supplied SQL script or
    # migrate the existing DB explicitly so this app never silently rewrites a schema.
    models  # Ensure model modules are imported for schema/documentation.
