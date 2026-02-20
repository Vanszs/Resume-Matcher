"""Authentication dependencies for FastAPI route protection."""

import logging
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings
from app.prisma_db import prisma

logger = logging.getLogger(__name__)

security = HTTPBearer()


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
):
    """Decode JWT token and return the current user.

    Usage:
        @router.get("/protected")
        async def protected_route(user = Depends(get_current_user)):
            ...
    """
    token = credentials.credentials
    try:
        payload = jwt.decode(
            token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
        )
        user_id: str | None = payload.get("sub")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: missing user ID",
            )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
        )
    except jwt.InvalidTokenError as e:
        logger.warning("Invalid JWT token: %s", e)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )

    try:
        user = await prisma.user.find_unique(
            where={"id": user_id},
            include={"role": True},
        )
    except Exception as e:
        logger.error("Database error while fetching user %s: %s", user_id, e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication error. Please try again.",
        )

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    if not user.isActive:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled",
        )

    return user


async def get_current_admin(user=Depends(get_current_user)):
    """Ensure the current user has the 'admin' role.

    Usage:
        @router.post("/admin-only")
        async def admin_route(user = Depends(get_current_admin)):
            ...
    """
    if not user.role or user.role.name != "admin":
        logger.warning(
            "Unauthorised admin access attempt by user %s (role=%s)",
            getattr(user, "email", "unknown"),
            getattr(user.role, "name", "none") if user.role else "none",
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return user
