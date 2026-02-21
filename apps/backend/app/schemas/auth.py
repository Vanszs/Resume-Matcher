from pydantic import BaseModel, EmailStr

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user_id: str
    email: str
    role: str

class UserResponse(BaseModel):
    """Current user profile returned by /auth/me."""
    user_id: str
    email: str
    username: str
    role: str
    is_active: bool
