"""FastAPI dependency — validate Supabase JWT and return the decoded payload.

Usage:
    from app.dependencies.auth import get_current_user

    @router.get("/resource")
    async def my_endpoint(user: dict = Depends(get_current_user)):
        user_id = user["sub"]
        ...

The JWT is issued by Supabase Auth and signed with SUPABASE_JWT_SECRET (HS256).
Audience claim is "authenticated".  Service-role tokens carry role="service_role".
"""
from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from core.config import get_settings
from core.logging import get_logger

logger = get_logger(__name__)

_security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_security),
) -> dict:
    """Decode and validate the Bearer JWT from the Authorization header.

    Returns the full JWT payload dict (sub, email, role, exp, …).
    Raises HTTP 401 if missing / invalid, 503 if not configured.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated — include Authorization: Bearer <token>",
            headers={"WWW-Authenticate": "Bearer"},
        )

    settings = get_settings()
    if not settings.supabase_jwt_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Auth not configured on server — set SUPABASE_JWT_SECRET",
        )

    try:
        import jwt  # PyJWT

        payload: dict = jwt.decode(
            credentials.credentials,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
        return payload

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError as exc:
        logger.debug("auth.invalid_token", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        )
