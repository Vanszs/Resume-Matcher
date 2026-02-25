from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RegisterResponse(BaseModel):
    """Returned after successful registration. No JWT is issued until email is verified."""
    user_id: str
    email: str
    message: str


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
    is_verified: bool


class VerifyEmailRequest(BaseModel):
    user_id: str
    otp_code: str


class ResendVerifyRequest(BaseModel):
    user_id: str
