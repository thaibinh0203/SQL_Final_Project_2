"""JWT helpers for API authentication."""

from __future__ import annotations

import base64
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
from typing import Any

from backend.config import get_settings
from backend.crud import AuthenticationError


@dataclass(frozen=True)
class CurrentUser:
    """Identity resolved from a verified access token."""

    account_id: int
    email: str
    role: str
    employer_id: int | None
    candidate_id: int | None
    display_name: str


def _b64url_encode(payload: bytes) -> str:
    return base64.urlsafe_b64encode(payload).rstrip(b"=").decode("ascii")


def _b64url_decode(payload: str) -> bytes:
    padding = "=" * (-len(payload) % 4)
    return base64.urlsafe_b64decode(f"{payload}{padding}")


def _json_dumps(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")


def _sign(message: str) -> str:
    secret = get_settings().jwt_secret.encode("utf-8")
    digest = hmac.new(secret, message.encode("ascii"), hashlib.sha256).digest()
    return _b64url_encode(digest)


def create_access_token(user: CurrentUser) -> str:
    """Create an HS256 JWT for one authenticated user."""

    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload = asdict(user)
    payload.update(
        {
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(minutes=settings.jwt_exp_minutes)).timestamp()),
        }
    )
    header = {"alg": "HS256", "typ": "JWT"}
    signing_input = f"{_b64url_encode(_json_dumps(header))}.{_b64url_encode(_json_dumps(payload))}"
    return f"{signing_input}.{_sign(signing_input)}"


def decode_access_token(token: str) -> CurrentUser:
    """Verify a JWT and return its identity claims."""

    try:
        header_raw, payload_raw, signature = token.split(".", 2)
    except ValueError as exc:
        raise AuthenticationError("Invalid access token.") from exc

    signing_input = f"{header_raw}.{payload_raw}"
    expected_signature = _sign(signing_input)
    if not hmac.compare_digest(signature, expected_signature):
        raise AuthenticationError("Invalid access token.")

    try:
        header = json.loads(_b64url_decode(header_raw))
        payload = json.loads(_b64url_decode(payload_raw))
    except Exception as exc:
        raise AuthenticationError("Invalid access token.") from exc

    if header.get("alg") != "HS256":
        raise AuthenticationError("Unsupported access token.")

    expires_at = int(payload.get("exp", 0))
    if expires_at <= int(datetime.now(timezone.utc).timestamp()):
        raise AuthenticationError("Access token has expired.")

    try:
        return CurrentUser(
            account_id=int(payload["account_id"]),
            email=str(payload["email"]),
            role=str(payload["role"]),
            employer_id=None if payload.get("employer_id") is None else int(payload["employer_id"]),
            candidate_id=None if payload.get("candidate_id") is None else int(payload["candidate_id"]),
            display_name=str(payload["display_name"]),
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise AuthenticationError("Invalid access token claims.") from exc
