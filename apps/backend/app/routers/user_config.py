"""User LLM configuration endpoints (per-user API keys)."""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator

from app.dependencies import get_current_user
from app.exceptions import DebugHTTPException
from app.prisma_db import prisma

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/user", tags=["User Settings"], dependencies=[Depends(get_current_user)])

VALID_PROVIDERS = {"openai", "anthropic", "openrouter", "gemini", "deepseek", "ollama"}


# --- Schemas ---

class LLMConfigInput(BaseModel):
    provider: str
    api_key: str | None = None
    model: str | None = None
    base_url: str | None = None
    is_default: bool = False

    @field_validator("provider")
    @classmethod
    def provider_must_be_valid(cls, v: str) -> str:
        if v not in VALID_PROVIDERS:
            raise ValueError(f"Invalid provider '{v}'. Must be one of: {', '.join(sorted(VALID_PROVIDERS))}")
        return v


class LLMConfigOut(BaseModel):
    id: str
    provider: str
    api_key_masked: str | None
    model: str | None
    base_url: str | None
    is_default: bool


def _mask_key(key: str | None) -> str | None:
    if not key:
        return None
    if len(key) <= 8:
        return "*" * len(key)
    return key[:4] + "…" + key[-4:]


# --- Endpoints ---

@router.get("/llm-config", response_model=list[LLMConfigOut])
async def get_llm_configs(user=Depends(get_current_user)) -> list[LLMConfigOut]:
    """Get all LLM configurations for the current user."""
    try:
        configs = await prisma.llmconfig.find_many(
            where={"userId": user.id},
            order={"createdAt": "desc"},
        )
        return [
            LLMConfigOut(
                id=c.id,
                provider=c.provider,
                api_key_masked=_mask_key(c.apiKey),
                model=c.model,
                base_url=c.baseUrl,
                is_default=c.isDefault,
            )
            for c in configs
        ]
    except Exception as e:
        logger.error("Failed to get LLM configs for user %s: %s", user.id, e)
        raise DebugHTTPException(status_code=500, detail="Failed to retrieve configurations.", error=e)


@router.post("/llm-config", response_model=LLMConfigOut)
async def upsert_llm_config(request: LLMConfigInput, user=Depends(get_current_user)) -> LLMConfigOut:
    """Create or update an LLM configuration for the current user.

    Uses upsert: if the user already has a config for this provider, it updates it.
    If is_default is True, all other configs for this user are set to non-default.

    NOTE: If api_key is None on an UPDATE, the existing key is PRESERVED (not cleared).
    Pass an empty string explicitly to clear the key.
    """
    try:
        # If api_key is None on update, keep the existing value
        existing = await prisma.llmconfig.find_unique(
            where={"userId_provider": {"userId": user.id, "provider": request.provider}}
        )

        # Only overwrite key if caller explicitly sent one (not None)
        api_key_to_write = request.api_key if request.api_key is not None else (
            existing.apiKey if existing else None
        )

        # If setting as default, unset all others first
        if request.is_default:
            await prisma.llmconfig.update_many(
                where={"userId": user.id, "isDefault": True},
                data={"isDefault": False},
            )

        config = await prisma.llmconfig.upsert(
            where={
                "userId_provider": {
                    "userId": user.id,
                    "provider": request.provider,
                }
            },
            data={
                "create": {
                    "userId": user.id,
                    "provider": request.provider,
                    "apiKey": api_key_to_write,
                    "model": request.model,
                    "baseUrl": request.base_url,
                    "isDefault": request.is_default,
                },
                "update": {
                    "apiKey": api_key_to_write,
                    "model": request.model,
                    "baseUrl": request.base_url,
                    "isDefault": request.is_default,
                },
            },
        )

        return LLMConfigOut(
            id=config.id,
            provider=config.provider,
            api_key_masked=_mask_key(config.apiKey),
            model=config.model,
            base_url=config.baseUrl,
            is_default=config.isDefault,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to upsert LLM config for user %s provider %s: %s", user.id, request.provider, e)
        raise DebugHTTPException(status_code=500, detail="Failed to save configuration.", error=e)


@router.put("/llm-config/{provider}/set-default")
async def set_default_provider(provider: str, user=Depends(get_current_user)) -> dict:
    """Set a provider as the default for the current user."""
    try:
        config = await prisma.llmconfig.find_unique(
            where={
                "userId_provider": {
                    "userId": user.id,
                    "provider": provider,
                }
            }
        )
        if not config:
            raise HTTPException(status_code=404, detail=f"No config found for provider '{provider}'")

        # Unset all defaults
        await prisma.llmconfig.update_many(
            where={"userId": user.id, "isDefault": True},
            data={"isDefault": False},
        )

        # Set this one as default
        await prisma.llmconfig.update(
            where={"id": config.id},
            data={"isDefault": True},
        )

        return {"message": f"'{provider}' is now the default provider"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to set default provider %s for user %s: %s", provider, user.id, e)
        raise DebugHTTPException(status_code=500, detail="Failed to update default provider.", error=e)


@router.delete("/llm-config/{provider}")
async def delete_llm_config(provider: str, user=Depends(get_current_user)) -> dict:
    """Delete an LLM configuration for a specific provider.

    If the deleted config was the default, the most recently created remaining
    config is automatically promoted to default.
    """
    try:
        config = await prisma.llmconfig.find_unique(
            where={
                "userId_provider": {
                    "userId": user.id,
                    "provider": provider,
                }
            }
        )
        if not config:
            raise HTTPException(status_code=404, detail=f"No config found for provider '{provider}'")

        was_default = config.isDefault
        await prisma.llmconfig.delete(where={"id": config.id})

        # If the deleted config was the default, promote the newest remaining one
        if was_default:
            remaining = await prisma.llmconfig.find_first(
                where={"userId": user.id},
                order={"createdAt": "desc"},
            )
            if remaining:
                await prisma.llmconfig.update(
                    where={"id": remaining.id},
                    data={"isDefault": True},
                )
                logger.info(
                    "Auto-promoted '%s' as default for user %s after deleting '%s'",
                    remaining.provider, user.id, provider
                )

        return {"message": f"Config for '{provider}' deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to delete LLM config %s for user %s: %s", provider, user.id, e)
        raise HTTPException(status_code=500, detail="Failed to delete configuration.")


# --- Self-service account changes ---

from app.services.auth import get_password_hash, verify_password


class ChangePasswordRequest(BaseModel):
    current_password: str
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


@router.patch("/me/password")
async def change_my_password(
    request: ChangePasswordRequest,
    user=Depends(get_current_user),
) -> dict:
    """Change the current user's password. Requires the existing password."""
    try:
        if not verify_password(request.current_password, user.passwordHash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is incorrect",
            )

        hashed = get_password_hash(request.new_password)
        await prisma.user.update(where={"id": user.id}, data={"passwordHash": hashed})

        logger.info("User %s changed their password", user.email)
        return {"message": "Password changed successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to change password for user %s: %s", user.id, e)
        raise HTTPException(status_code=500, detail="Failed to change password.")


@router.patch("/me/username")
async def change_my_username(
    request: ChangeUsernameRequest,
    user=Depends(get_current_user),
) -> dict:
    """Change the current user's username."""
    try:
        existing = await prisma.user.find_first(where={"username": request.new_username})
        if existing and existing.id != user.id:
            raise HTTPException(status_code=409, detail="Username is already taken")

        await prisma.user.update(
            where={"id": user.id}, data={"username": request.new_username}
        )

        logger.info("User %s changed username: %s → %s", user.email, user.username, request.new_username)
        return {"message": f"Username changed to '{request.new_username}'"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to change username for user %s: %s", user.id, e)
        raise HTTPException(status_code=500, detail="Failed to change username.")

