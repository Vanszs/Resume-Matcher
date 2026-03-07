"""Custom exception types for extended error responses."""

from fastapi import HTTPException


class DebugHTTPException(HTTPException):
    """HTTPException subclass that appends debug fields to the response body.

    Response body shape:
        {
          "detail":       <str>  — user-friendly message (unchanged, FE compatible)
          "error_type":   <str>  — Python exception class name
          "error_detail": <str>  — str(exception) with the actual error
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
            self.error_detail = str(error)
        else:
            self.error_type = error_type
            self.error_detail = error_detail
