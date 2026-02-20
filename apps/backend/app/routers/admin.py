"""Admin-only endpoints for managing users and roles."""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, field_validator

from app.dependencies import get_current_admin
from app.prisma_db import prisma
from app.services.auth import get_password_hash
from app.config import load_config_file, save_config_file

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["Admin"], dependencies=[Depends(get_current_admin)])


# --- Schemas ---

class CreateUserRequest(BaseModel):
    email: EmailStr
    username: str
    password: str
    role_id: str

    @field_validator("username")
    @classmethod
    def username_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Username cannot be empty")
        if len(v) < 3:
            raise ValueError("Username must be at least 3 characters")
        return v

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class UserResponse(BaseModel):
    id: str
    email: str
    username: str
    is_active: bool
    role_name: str
    created_at: str


class CreateRoleRequest(BaseModel):
    name: str
    permissions: list[str] = []


class RoleResponse(BaseModel):
    id: str
    name: str
    permissions: str


# --- User CRUD ---

@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(request: CreateUserRequest, admin=Depends(get_current_admin)) -> UserResponse:
    """Create a new user (admin only)."""
    try:
        # Check email uniqueness
        existing_email = await prisma.user.find_unique(where={"email": request.email})
        if existing_email:
            raise HTTPException(status_code=409, detail="User with this email already exists")

        # Check username uniqueness
        existing_username = await prisma.user.find_first(where={"username": request.username})
        if existing_username:
            raise HTTPException(status_code=409, detail="Username is already taken")

        # Verify role exists
        role = await prisma.role.find_unique(where={"id": request.role_id})
        if not role:
            raise HTTPException(status_code=404, detail="Role not found")

        hashed_password = get_password_hash(request.password)
        user = await prisma.user.create(
            data={
                "email": request.email,
                "username": request.username,
                "passwordHash": hashed_password,
                "roleId": request.role_id,
                "isActive": True,
                "createdById": admin.id,
            },
            include={"role": True},
        )

        logger.info("Admin %s created user %s (role=%s)", admin.email, user.email, role.name)

        return UserResponse(
            id=user.id,
            email=user.email,
            username=user.username,
            is_active=user.isActive,
            role_name=user.role.name if user.role else "unknown",
            created_at=user.createdAt.isoformat(),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to create user %s: %s", request.email, e)
        raise HTTPException(status_code=500, detail="Failed to create user. Please try again.")


@router.get("/users", response_model=list[UserResponse])
async def list_users() -> list[UserResponse]:
    """List all users (admin only)."""
    try:
        users = await prisma.user.find_many(include={"role": True}, order={"createdAt": "desc"})
        return [
            UserResponse(
                id=u.id,
                email=u.email,
                username=u.username,
                is_active=u.isActive,
                role_name=u.role.name if u.role else "unknown",
                created_at=u.createdAt.isoformat(),
            )
            for u in users
        ]
    except Exception as e:
        logger.error("Failed to list users: %s", e)
        raise HTTPException(status_code=500, detail="Failed to retrieve users.")


@router.patch("/users/{user_id}/toggle-active")
async def toggle_user_active(user_id: str, admin=Depends(get_current_admin)) -> dict:
    """Toggle a user's active status (admin only)."""
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot disable your own account")

    try:
        user = await prisma.user.find_unique(where={"id": user_id})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        updated = await prisma.user.update(
            where={"id": user_id},
            data={"isActive": not user.isActive},
        )

        action = "activated" if updated.isActive else "disabled"
        logger.info("Admin %s %s user %s", admin.email, action, user.email)

        return {"id": updated.id, "is_active": updated.isActive}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to toggle active for user %s: %s", user_id, e)
        raise HTTPException(status_code=500, detail="Failed to update user status.")


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, admin=Depends(get_current_admin)) -> dict:
    """Delete a user (admin only). Cannot delete yourself."""
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    try:
        user = await prisma.user.find_unique(where={"id": user_id})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        await prisma.user.delete(where={"id": user_id})

        logger.info("Admin %s deleted user %s", admin.email, user.email)

        return {"message": f"User {user.email} deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to delete user %s: %s", user_id, e)
        raise HTTPException(status_code=500, detail="Failed to delete user.")


class ResetPasswordRequest(BaseModel):
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class ChangeUsernameRequest(BaseModel):
    new_username: str

    @field_validator("new_username")
    @classmethod
    def username_valid(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3:
            raise ValueError("Username must be at least 3 characters")
        return v


@router.patch("/users/{user_id}/password")
async def reset_user_password(
    user_id: str,
    request: ResetPasswordRequest,
    admin=Depends(get_current_admin),
) -> dict:
    """Reset any user's password (admin only)."""
    try:
        user = await prisma.user.find_unique(where={"id": user_id})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        hashed = get_password_hash(request.new_password)
        await prisma.user.update(where={"id": user_id}, data={"passwordHash": hashed})

        logger.info("Admin %s reset password for user %s", admin.email, user.email)
        return {"message": f"Password reset for {user.email}"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to reset password for user %s: %s", user_id, e)
        raise HTTPException(status_code=500, detail="Failed to reset password.")


@router.patch("/users/{user_id}/username")
async def change_user_username(
    user_id: str,
    request: ChangeUsernameRequest,
    admin=Depends(get_current_admin),
) -> dict:
    """Change any user's username (admin only)."""
    try:
        user = await prisma.user.find_unique(where={"id": user_id})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        # Check uniqueness
        existing = await prisma.user.find_first(where={"username": request.new_username})
        if existing and existing.id != user_id:
            raise HTTPException(status_code=409, detail="Username is already taken")

        await prisma.user.update(
            where={"id": user_id}, data={"username": request.new_username}
        )

        logger.info(
            "Admin %s changed username for %s: %s → %s",
            admin.email, user.email, user.username, request.new_username,
        )
        return {"message": f"Username changed to '{request.new_username}'"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to change username for user %s: %s", user_id, e)
        raise HTTPException(status_code=500, detail="Failed to change username.")


# --- Role CRUD ---

@router.post("/roles", response_model=RoleResponse, status_code=status.HTTP_201_CREATED)
async def create_role(request: CreateRoleRequest) -> RoleResponse:
    """Create a new role (admin only)."""
    try:
        existing = await prisma.role.find_unique(where={"name": request.name})
        if existing:
            raise HTTPException(status_code=409, detail="Role with this name already exists")

        role = await prisma.role.create(
            data={
                "name": request.name,
                "permissions": json.dumps(request.permissions),
            }
        )
        return RoleResponse(id=role.id, name=role.name, permissions=role.permissions)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to create role %s: %s", request.name, e)
        raise HTTPException(status_code=500, detail="Failed to create role.")


@router.get("/roles", response_model=list[RoleResponse])
async def list_roles() -> list[RoleResponse]:
    """List all roles (admin only)."""
    try:
        roles = await prisma.role.find_many()
        return [RoleResponse(id=r.id, name=r.name, permissions=r.permissions) for r in roles]
    except Exception as e:
        logger.error("Failed to list roles: %s", e)
        raise HTTPException(status_code=500, detail="Failed to retrieve roles.")


# --- App-level settings ---

class AppSettingsResponse(BaseModel):
    register_enabled: bool


class AppSettingsUpdate(BaseModel):
    register_enabled: bool


@router.get("/app-settings", response_model=AppSettingsResponse)
async def get_app_settings(_admin=Depends(get_current_admin)) -> AppSettingsResponse:
    """Get global application settings (admin only)."""
    cfg = load_config_file()
    return AppSettingsResponse(register_enabled=bool(cfg.get("register_enabled", False)))


@router.patch("/app-settings", response_model=AppSettingsResponse)
async def update_app_settings(
    request: AppSettingsUpdate,
    admin=Depends(get_current_admin),
) -> AppSettingsResponse:
    """Update global application settings (admin only)."""
    cfg = load_config_file()
    cfg["register_enabled"] = request.register_enabled
    save_config_file(cfg)
    logger.info(
        "Admin %s set register_enabled=%s", admin.email, request.register_enabled
    )
    return AppSettingsResponse(register_enabled=request.register_enabled)
