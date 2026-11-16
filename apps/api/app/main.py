"""
FastAPI application entry point.

Wires together:
- CORS for the Next.js frontend
- Routers (health, auth, and future feature routes)
- Lifespan hooks for startup/shutdown (DB connection check, etc.)
"""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routes import auth, health, interviews, job_descriptions, rag, resumes


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: verify DB connection, warm caches, etc.
    # (We'll add real checks here on Day 2/3.)
    print(f"🚀 Starting {settings.app_name} in {settings.environment} mode")
    yield
    # Shutdown: close pools, flush logs, etc.
    print("👋 Shutting down")


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="AI-powered interview preparation platform",
    lifespan=lifespan,
)

# Get allowed origins from env, fallback to localhost for dev
allowed_origins_str = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000")
allowed_origins = [origin.strip() for origin in allowed_origins_str.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def strip_api_prefix(request, call_next):
    """Allow requests arriving via Vercel's `/api/(.*)` rewrite to match root routers."""
    path = request.scope.get("path", "")
    if path == "/api":
        request.scope["path"] = "/"
    elif path.startswith("/api/"):
        request.scope["path"] = path[4:]
    return await call_next(request)

# Routers
app.include_router(health.router, tags=["health"])
app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(resumes.router, prefix="/resumes", tags=["resumes"])
app.include_router(
    job_descriptions.router,
    prefix="/job-descriptions",
    tags=["job-descriptions"],
)
app.include_router(interviews.router, prefix="/interviews", tags=["interviews"])
app.include_router(rag.router, prefix="/rag", tags=["rag"])


@app.get("/")
async def root():
    return {
        "name": settings.app_name,
        "version": "0.1.0",
        "docs": "/docs",
        "health": "/health",
    }
