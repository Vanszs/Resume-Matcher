"""Admin-only endpoints for managing users and roles."""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr

from app.dependencies import get_current_admin
from app.prisma_db import prisma
from app.services.auth import get_password_hash

router = APIRouter(prefix="/admin", tags=["Admin"], dependencies=[Depends(get_current_admin)])


# --- Schemas ---

class CreateUserRequest(BaseModel):
    email: EmailStr
    username: str
    password: str
    role_id: str

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
async def create_user(request: CreateUserRequest, admin=Depends(get_current_admin)):
    """Create a new user (admin only)."""
    if len(request.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    existing = await prisma.user.find_unique(where={"email": request.email})
    if existing:
        raise HTTPException(status_code=409, detail="User with this email already exists")

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

    return UserResponse(
        id=user.id,
        email=user.email,
        username=user.username,
        is_active=user.isActive,
        role_name=user.role.name if user.role else "unknown",
        created_at=user.createdAt.isoformat(),
    )


@router.get("/users", response_model=list[UserResponse])
async def list_users():
    """List all users (admin only)."""
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


@router.patch("/users/{user_id}/toggle-active")
async def toggle_user_active(user_id: str, admin=Depends(get_current_admin)):
    """Toggle a user's active status (admin only)."""
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot disable your own account")

    user = await prisma.user.find_unique(where={"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    updated = await prisma.user.update(
        where={"id": user_id},
        data={"isActive": not user.isActive},
    )
    return {"id": updated.id, "is_active": updated.isActive}


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, admin=Depends(get_current_admin)):
    """Delete a user (admin only). Cannot delete yourself."""
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    user = await prisma.user.find_unique(where={"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    await prisma.user.delete(where={"id": user_id})
    return {"message": f"User {user.email} deleted"}


# --- Role CRUD ---

@router.post("/roles", response_model=RoleResponse, status_code=status.HTTP_201_CREATED)
async def create_role(request: CreateRoleRequest):
    """Create a new role (admin only)."""
    import json
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


@router.get("/roles", response_model=list[RoleResponse])
async def list_roles():
    """List all roles (admin only)."""
    roles = await prisma.role.find_many()
    return [RoleResponse(id=r.id, name=r.name, permissions=r.permissions) for r in roles]
