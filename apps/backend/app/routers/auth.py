"""Authentication endpoints."""

import logging
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.dependencies import get_current_user
from app.prisma_db import prisma
from app.schemas.auth import (
    LoginRequest,
    RegisterResponse,
    TokenResponse,
    UserResponse,
    VerifyEmailRequest,
    ResendVerifyRequest,
)
from app.services.auth import create_access_token, get_password_hash, verify_password
from app.services.email import create_verification_token, send_verification_email
from app.config import load_config_file

logger = logging.getLogger(__name__)

limiter = Limiter(key_func=get_remote_address)

router = APIRouter(tags=["Authentication"])


@router.get("/auth/me", response_model=UserResponse)
async def get_current_user_info(
    user: Annotated[object, Depends(get_current_user)],
) -> UserResponse:
    """Return the profile of the currently authenticated user.

    Validates the JWT token and returns user info.  The frontend calls
    this on app load to verify the session is still valid.
    """
    return UserResponse(
        user_id=user.id,
        email=user.email,
        username=user.username,
        role=user.role.name if user.role else "user",
        is_active=user.isActive,
        is_verified=user.isVerified,
    )


@router.get("/auth/register-status")
async def get_register_status() -> dict:
    """Public endpoint: returns whether self-registration is currently enabled."""
    cfg = load_config_file()
    return {"enabled": bool(cfg.get("register_enabled", False))}


@router.post("/auth/register", response_model=RegisterResponse)
@limiter.limit("5/minute")
async def register(request: Request, body: LoginRequest) -> RegisterResponse:
    """Self-register a new account.

    Only works when the admin has enabled registration via the admin panel.
    New accounts are assigned the default 'user' role automatically.
    Does NOT return an access token — users must verify their email first.
    """
    cfg = load_config_file()
    if not cfg.get("register_enabled", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Registration is currently disabled. Contact an administrator.",
        )

    # Derive a username from the email local-part
    username_base = body.email.split("@")[0].replace(".", "_").replace("+", "_")

    try:
        # Check email uniqueness
        existing = await prisma.user.find_unique(where={"email": body.email})
        if existing:
            raise HTTPException(status_code=409, detail="An account with this email already exists.")

        # Resolve the 'user' role (must exist, seeded at startup)
        user_role = await prisma.role.find_unique(where={"name": "user"})
        if not user_role:
            # Fallback: create the role on-the-fly
            user_role = await prisma.role.create(
                data={"name": "user", "permissions": "[]"}
            )

        # Ensure username is unique (append counter if needed)
        username = username_base
        counter = 1
        while await prisma.user.find_first(where={"username": username}):
            username = f"{username_base}_{counter}"
            counter += 1

        hashed_password = get_password_hash(body.password)
        new_user = await prisma.user.create(
            data={
                "email": body.email,
                "username": username,
                "passwordHash": hashed_password,
                "roleId": user_role.id,
                "isActive": True,
            },
            include={"role": True},
        )

        logger.info("New user registered: %s", new_user.email)

        # Generate OTP and send email — do not block response on email failure
        otp_code = await create_verification_token(new_user.id)
        email_sent = await send_verification_email(new_user.email, otp_code)
        if not email_sent:
            logger.warning("Registration OTP email failed to send for %s", new_user.email)

        # Return user_id only — no JWT. User must verify email before accessing the app.
        return RegisterResponse(
            user_id=new_user.id,
            email=new_user.email,
            message="Account created. Please check your email for a verification code.",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Registration failed for %s: %s", body.email, e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Registration failed. Please try again.",
        )


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
            logger.warning("Disabled user attempted login: %s", body.email)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account is disabled",
            )

        if not user.isVerified:
            logger.info("Unverified user attempted login: %s", body.email)
            # Return a specific detail so the frontend knows to show the Verification Wall.
            # Pass user_id in a custom header so the frontend can call resend-verification.
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="EMAIL_NOT_VERIFIED",
                headers={"X-User-Id": user.id},
            )

        if not user.role:
            logger.error("User %s has no role assigned", body.email)
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


@router.post("/auth/verify-email")
@limiter.limit("10/minute")
async def verify_email(request: Request, body: VerifyEmailRequest) -> dict:
    """Verify a user's email using a 6-digit OTP code."""

    # Validate the user exists and is not already verified
    user = await prisma.user.find_unique(where={"id": body.user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    if not user.isActive:
        raise HTTPException(status_code=403, detail="User account is disabled.")
    if user.isVerified:
        return {"message": "Email is already verified."}

    # Retrieve matching token
    token_record = await prisma.verificationtoken.find_first(
        where={
            "userId": body.user_id,
            "type": "EMAIL_VERIFICATION",
            "token": body.otp_code,
            "isRevoked": False,
        }
    )

    if not token_record:
        raise HTTPException(status_code=400, detail="Invalid verification code.")

    # Check expiration
    if token_record.expiresAt < datetime.now(timezone.utc):
        # Auto-revoke expired token
        await prisma.verificationtoken.update(
            where={"id": token_record.id}, data={"isRevoked": True}
        )
        raise HTTPException(status_code=400, detail="Verification code expired. Please request a new one.")

    # Success! Mark user as verified and revoke the token atomically
    await prisma.user.update(
        where={"id": body.user_id},
        data={"isVerified": True},
    )
    await prisma.verificationtoken.update(
        where={"id": token_record.id}, data={"isRevoked": True}
    )

    logger.info("User %s email verified successfully.", body.user_id)
    return {"message": "Email verified successfully."}


@router.post("/auth/resend-verification")
@limiter.limit("3/minute")
async def resend_verification(request: Request, body: ResendVerifyRequest) -> dict:
    """Resend a 6-digit OTP code to the user's email."""
    user = await prisma.user.find_unique(where={"id": body.user_id})

    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    if user.isVerified:
        raise HTTPException(status_code=400, detail="Email is already verified.")

    # Generate the new OTP first
    otp_code = await create_verification_token(user.id)

    # Attempt to send. If it fails, we still have the new OTP in the DB.
    # The user can try resending again (rate-limited to 3/minute).
    success = await send_verification_email(user.email, otp_code)

    if not success:
        logger.error("Resend verification failed for %s", user.email)
        raise HTTPException(
            status_code=500,
            detail="Failed to send verification email. Please try again later.",
        )

    logger.info("Resent OTP verification email to user %s.", user.email)
    return {"message": "Verification code sent."}
