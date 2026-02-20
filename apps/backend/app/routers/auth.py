from fastapi import APIRouter, HTTPException, status
from app.schemas.auth import LoginRequest, TokenResponse
from app.services.auth import verify_password, create_access_token
from app.prisma_db import prisma

router = APIRouter(tags=["Authentication"])

@router.post("/auth/login", response_model=TokenResponse)
async def login(request: LoginRequest):
    user = await prisma.user.find_unique(
        where={"email": request.email},
        include={"role": True}
    )
    
    if not user or not verify_password(request.password, user.passwordHash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    if not user.isActive:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled",
        )
    
    access_token = create_access_token(
        data={"sub": user.id, "email": user.email, "role": user.role.name}
    )
    
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user_id=user.id,
        email=user.email,
        role=user.role.name
    )
