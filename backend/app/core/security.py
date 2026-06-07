from datetime import datetime, timedelta, timezone
from typing import Optional
import uuid
from jose import JWTError, jwt
from passlib.context import CryptContext
from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Separate short-lived purpose claim for export tokens
_EXPORT_PURPOSE = "export"


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return None


def create_export_token(user_id: str, ttl_seconds: int = 60) -> tuple[str, str]:
    """
    Issue a short-lived JWT (default 60s) scoped only for file exports.
    Returns (token, jti). The jti must be persisted in UsedExportToken after
    successful consumption so the token cannot be replayed.

    The `purpose` claim prevents this token being accepted by decode_token
    (which is used for normal auth) because normal auth never checks `purpose`.
    To be safe, verify_export_token explicitly checks the purpose claim.
    """
    jti = uuid.uuid4().hex
    payload = {
        "sub": user_id,
        "purpose": _EXPORT_PURPOSE,
        "jti": jti,
        "exp": datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM), jti


def verify_export_token(token: str) -> Optional[tuple[str, str]]:
    """Returns (user_id, jti) if valid export token, else None."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("purpose") != _EXPORT_PURPOSE:
            return None
        sub = payload.get("sub")
        jti = payload.get("jti")
        if not sub or not jti:
            return None
        return sub, jti
    except JWTError:
        return None
