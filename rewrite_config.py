import re

with open("apps/backend/app/routers/config.py", "r") as f:
    content = f.read()

# Remove global dependency
content = content.replace(
    'router = APIRouter(prefix="/config", tags=["Configuration"], dependencies=[Depends(get_current_user)])',
    'router = APIRouter(prefix="/config", tags=["Configuration"])'
)

# Add dependencies to specific routes
protected_routes = [
    r'@router\.get\("/llm-api-key", response_model=LLMConfigResponse\)',
    r'@router\.put\("/llm-api-key", response_model=LLMConfigResponse\)',
    r'@router\.post\("/llm-test"\)',
    r'@router\.put\("/features", response_model=FeatureConfigResponse\)',
    r'@router\.put\("/language", response_model=LanguageConfigResponse\)',
    r'@router\.put\("/prompts", response_model=PromptConfigResponse\)',
    r'@router\.get\("/api-keys", response_model=ApiKeyStatusResponse\)',
    r'@router\.post\("/api-keys", response_model=ApiKeysUpdateResponse\)',
    r'@router\.delete\("/api-keys/\{provider\}"\)'
]

for route in protected_routes:
    # replace the match with itself + dependencies add
    def replacer(match):
        original = match.group(0)
        if original.endswith(')'):
            return original[:-1] + ', dependencies=[Depends(get_current_user)])'
        return original
    
    content = re.sub(route, replacer, content)

with open("apps/backend/app/routers/config.py", "w") as f:
    f.write(content)
print("Done")
