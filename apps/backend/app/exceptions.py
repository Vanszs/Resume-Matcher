"""Custom exception types for extended error responses."""

from fastapi import HTTPException


# Patterns that look like API keys / secrets to redact from error messages
_SECRET_PATTERNS = [
    r'sk[_-][A-Za-z0-9]{10,}',            # sk_xxx / sk-xxx style keys
    r'key[_-][A-Za-z0-9]{10,}',            # key_xxx style keys
    r'api[_-]?key\s*[=:]\s*\S+',          # api_key=xxx or apiKey: xxx
    r'Bearer\s+\S+',                       # Authorization headers
]


def _sanitize_error_message(msg: str) -> str:
    """Remove potential secrets/API keys from error messages."""
    import re
    sanitized = msg
    for pattern in _SECRET_PATTERNS:
        sanitized = re.sub(pattern, '[REDACTED]', sanitized, flags=re.IGNORECASE)
    # Truncate to prevent excessively long error dumps
    if len(sanitized) > 500:
        sanitized = sanitized[:500] + '... [truncated]'
    return sanitized


class DebugHTTPException(HTTPException):
    """HTTPException subclass that appends debug fields to the response body.

    Response body shape:
        {
          "detail":       <str>  — user-friendly message (unchanged, FE compatible)
          "error_type":   <str>  — Python exception class name
          "error_detail": <str>  — sanitized str(exception) with the actual error
        }

    Use this instead of bare HTTPException(500, ...) in any except block where
    you want the real error to be visible in the network response for debugging
    without exposing it in the UI (the UI reads its own i18n strings, not detail).
    """

    def __init__(
        self,
        status_code: int,
        detail: str,
        error: Exception | None = None,
        error_type: str = "",
        error_detail: str = "",
    ) -> None:
        super().__init__(status_code=status_code, detail=detail)
        if error is not None:
            self.error_type = type(error).__name__
            self.error_detail = _sanitize_error_message(str(error))
        else:
            self.error_type = error_type
            self.error_detail = _sanitize_error_message(error_detail)
