"""Authentication endpoints."""

import logging

from fastapi import APIRouter, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.prisma_db import prisma
from app.schemas.auth import LoginRequest, TokenResponse
from app.services.auth import create_access_token, verify_password

logger = logging.getLogger(__name__)

limiter = Limiter(key_func=get_remote_address)

router = APIRouter(tags=["Authentication"])


@router.post("/auth/login", response_model=TokenResponse)
@limiter.limit("5/minute")
async def login(request: Request, body: LoginRequest) -> TokenResponse:
    """Authenticate user and return a JWT access token.

    Uses a timing-safe check: both "user not found" and "wrong password"
    return the same 401 so that attackers cannot enumerate valid emails.
    """
    try:
        user = await prisma.user.find_unique(
            where={"email": body.email},
            include={"role": True},
        )

        # Timing-safe check: run bcrypt even if user not found so that
        # response time is identical regardless of whether the email exists.
        # Without this, missing-user responses are ~100ms faster (no bcrypt),
        # leaking which emails are registered.
        _DUMMY_HASH = "$2b$12$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa."

        if user is not None:
            password_ok = verify_password(body.password, user.passwordHash)
        else:
            verify_password(body.password, _DUMMY_HASH)  # constant-time dummy
            password_ok = False

        if not password_ok:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )

        if not user.isActive:
            logger.warning("Disabled user attempted login: %s", request.email)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account is disabled",
            )

        if not user.role:
            logger.error("User %s has no role assigned", request.email)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Login failed. Please contact an administrator.",
            )

        access_token = create_access_token(
            data={"sub": user.id, "email": user.email, "role": user.role.name}
        )

        logger.info("Successful login: %s (role=%s)", user.email, user.role.name)

        return TokenResponse(
            access_token=access_token,
            token_type="bearer",
            user_id=user.id,
            email=user.email,
            role=user.role.name,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Unexpected error during login for %s: %s", body.email, e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Login failed. Please try again.",
        )
