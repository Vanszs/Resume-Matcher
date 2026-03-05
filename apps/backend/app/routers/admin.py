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
    is_verified: bool
    role_name: str
    created_at: str


class CreateRoleRequest(BaseModel):
    name: str
    permissions: list[str] = []


class RoleResponse(BaseModel):
    id: str
    name: str
    permissions: str


class ChangeRoleRequest(BaseModel):
    role_id: str


class AdminMeResponse(BaseModel):
    id: str
    email: str
    username: str
    role_name: str


# --- User CRUD ---

@router.get("/me", response_model=AdminMeResponse)
async def get_admin_me(admin=Depends(get_current_admin)) -> AdminMeResponse:
    """Return the currently authenticated admin's own profile."""
    return AdminMeResponse(
        id=admin.id,
        email=admin.email,
        username=admin.username,
        role_name=admin.role.name if admin.role else "admin",
    )

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
            is_verified=user.isVerified,
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
                is_verified=u.isVerified,
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
    """Delete a user (admin only). Cannot delete yourself or the last admin."""
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    try:
        user = await prisma.user.find_unique(where={"id": user_id}, include={"role": True})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        # Last-admin guard: refuse if this is the only admin account
        if user.role and user.role.name == "admin":
            admin_count = await prisma.user.count(
                where={"roleId": user.roleId, "isActive": True}
            )
            if admin_count <= 1:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot delete the last admin account. Promote another user to admin first.",
                )

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


@router.patch("/users/{user_id}/role")
async def change_user_role(
    user_id: str,
    request: ChangeRoleRequest,
    admin=Depends(get_current_admin),
) -> UserResponse:
    """Assign a different role to a user (admin only).

    Guards:
    - Cannot change your own role.
    - Cannot demote the last admin account.
    """
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot change your own role")

    try:
        user = await prisma.user.find_unique(where={"id": user_id}, include={"role": True})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        new_role = await prisma.role.find_unique(where={"id": request.role_id})
        if not new_role:
            raise HTTPException(status_code=404, detail="Role not found")

        # Last-admin guard: if taking the user OUT of admin role
        if user.role and user.role.name == "admin" and new_role.name != "admin":
            admin_count = await prisma.user.count(
                where={"roleId": user.roleId, "isActive": True}
            )
            if admin_count <= 1:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot demote the last admin account. Promote another user to admin first.",
                )

        updated = await prisma.user.update(
            where={"id": user_id},
            data={"roleId": request.role_id},
            include={"role": True},
        )

        logger.info(
            "Admin %s changed role for %s: %s → %s",
            admin.email,
            updated.email,
            user.role.name if user.role else "none",
            new_role.name,
        )

        return UserResponse(
            id=updated.id,
            email=updated.email,
            username=updated.username,
            is_active=updated.isActive,
            is_verified=updated.isVerified,
            role_name=updated.role.name if updated.role else new_role.name,
            created_at=updated.createdAt,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to change role for user %s: %s", user_id, e)
        raise HTTPException(status_code=500, detail="Failed to change user role.")


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
    maintenance_enabled: bool = False
    maintenance_message: str = ""


class AppSettingsUpdate(BaseModel):
    register_enabled: bool
    maintenance_enabled: bool | None = None
    maintenance_message: str | None = None

    @field_validator("maintenance_message")
    @classmethod
    def message_max_length(cls, v: str | None) -> str | None:
        if v is not None and len(v) > 2000:
            raise ValueError("Maintenance message must be 2000 characters or less")
        return v


@router.get("/app-settings", response_model=AppSettingsResponse)
async def get_app_settings(_admin=Depends(get_current_admin)) -> AppSettingsResponse:
    """Get global application settings (admin only)."""
    cfg = load_config_file()
    return AppSettingsResponse(
        register_enabled=bool(cfg.get("register_enabled", False)),
        maintenance_enabled=bool(cfg.get("maintenance_enabled", False)),
        maintenance_message=str(cfg.get("maintenance_message", "")),
    )


@router.patch("/app-settings", response_model=AppSettingsResponse)
async def update_app_settings(
    request: AppSettingsUpdate,
    admin=Depends(get_current_admin),
) -> AppSettingsResponse:
    """Update global application settings (admin only)."""
    cfg = load_config_file()
    cfg["register_enabled"] = request.register_enabled
    if request.maintenance_enabled is not None:
        cfg["maintenance_enabled"] = request.maintenance_enabled
    if request.maintenance_message is not None:
        cfg["maintenance_message"] = request.maintenance_message
    save_config_file(cfg)
    logger.info(
        "Admin %s updated app settings: register_enabled=%s, maintenance_enabled=%s",
        admin.email,
        request.register_enabled,
        cfg.get("maintenance_enabled"),
    )
    return AppSettingsResponse(
        register_enabled=bool(cfg["register_enabled"]),
        maintenance_enabled=bool(cfg.get("maintenance_enabled", False)),
        maintenance_message=str(cfg.get("maintenance_message", "")),
    )
