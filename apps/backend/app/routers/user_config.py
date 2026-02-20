"""User LLM configuration endpoints (per-user API keys)."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.dependencies import get_current_user
from app.prisma_db import prisma

router = APIRouter(prefix="/user", tags=["User Settings"], dependencies=[Depends(get_current_user)])


# --- Schemas ---

class LLMConfigInput(BaseModel):
    provider: str
    api_key: str | None = None
    model: str | None = None
    base_url: str | None = None
    is_default: bool = False

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
async def get_llm_configs(user=Depends(get_current_user)):
    """Get all LLM configurations for the current user."""
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


@router.post("/llm-config", response_model=LLMConfigOut)
async def upsert_llm_config(request: LLMConfigInput, user=Depends(get_current_user)):
    """Create or update an LLM configuration for the current user.

    Uses upsert: if the user already has a config for this provider, it updates it.
    If is_default is True, all other configs for this user are set to non-default.
    """
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
                "apiKey": request.api_key,
                "model": request.model,
                "baseUrl": request.base_url,
                "isDefault": request.is_default,
            },
            "update": {
                "apiKey": request.api_key,
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


@router.put("/llm-config/{provider}/set-default")
async def set_default_provider(provider: str, user=Depends(get_current_user)):
    """Set a provider as the default for the current user."""
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


@router.delete("/llm-config/{provider}")
async def delete_llm_config(provider: str, user=Depends(get_current_user)):
    """Delete an LLM configuration for a specific provider."""
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

    await prisma.llmconfig.delete(where={"id": config.id})
    return {"message": f"Config for '{provider}' deleted"}
