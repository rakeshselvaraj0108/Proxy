from dataclasses import dataclass

from fastapi import Depends, Header

from app.auth.jwt import JwtVerificationError, claims_to_user, verify_supabase_jwt
from app.core.config import get_settings
from app.core.errors import ProxyError


@dataclass(frozen=True)
class CurrentUser:
    id: str
    email: str | None = None
    role: str = "user"


async def get_current_user(authorization: str | None = Header(default=None)) -> CurrentUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise ProxyError("Missing bearer token", status_code=401, code="unauthorized")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise ProxyError("Invalid bearer token", status_code=401, code="unauthorized")

    settings = get_settings()
    if settings.environment == "development" and not settings.supabase_jwt_secret:
        return CurrentUser(id=token)

    try:
        claims = verify_supabase_jwt(token)
    except JwtVerificationError as exc:
        raise ProxyError(f"Invalid token: {exc}", status_code=401, code="unauthorized") from exc

    user = claims_to_user(claims)
    if not user["id"]:
        raise ProxyError("Token missing subject", status_code=401, code="unauthorized")
    return CurrentUser(id=user["id"], email=user.get("email"), role=user.get("role", "user"))


async def require_admin(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if user.role != "admin":
        raise ProxyError("Admin permission required", status_code=403, code="forbidden")
    return user
