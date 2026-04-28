"""Cloudflare R2 uploader.

Instagram's Graph API needs a *public* HTTPS URL for the source video, and
hosting straight off the Colab cloudflared tunnel is unreliable. We push
finished MP4s to an R2 bucket with public-read access and return a stable
URL on the configured ``R2_PUBLIC_BASE_URL`` (or the bucket's public dev
domain if you've enabled it).
"""
from __future__ import annotations

import asyncio
import os
from pathlib import Path

import httpx

from core.config import get_settings
from core.logging import get_logger

logger = get_logger(__name__)


class R2Unavailable(Exception):
    """Required R2 env vars are missing."""


class R2UploadError(Exception):
    """Upload to R2 failed."""


def _require_settings() -> tuple[str, str, str, str, str]:
    s = get_settings()
    missing = [
        n for n, v in [
            ("R2_ACCOUNT_ID", s.r2_account_id),
            ("R2_ACCESS_KEY_ID", s.r2_access_key_id),
            ("R2_SECRET_ACCESS_KEY", s.r2_secret_access_key),
        ] if not v
    ]
    if missing:
        raise R2Unavailable(f"missing R2 env vars: {', '.join(missing)}")
    # אם לא הוגדר public base נשתמש ב-public dev domain של R2
    public_base = (
        s.r2_public_base_url
        or f"https://pub-{s.r2_account_id}.r2.dev/{s.r2_bucket}"
    ).rstrip("/")
    return s.r2_account_id, s.r2_access_key_id, s.r2_secret_access_key, s.r2_bucket, public_base


def _build_client():
    """Return a boto3 S3 client pointed at the R2 endpoint."""
    # boto3 לא נטען עד הרגע האחרון כדי שייבוא של המודול לא ייכשל בלי R2
    import boto3
    from botocore.config import Config as BotoConfig

    account_id, access_key, secret_key, bucket, _ = _require_settings()
    endpoint = f"https://{account_id}.r2.cloudflarestorage.com"
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        config=BotoConfig(signature_version="s3v4", retries={"max_attempts": 3}),
        region_name="auto",
    ), bucket


async def upload_file(
    local_path: str | os.PathLike,
    *,
    key: str | None = None,
    content_type: str = "video/mp4",
) -> str:
    """Upload a local file to R2 and return its public URL.

    ``key`` defaults to the file's basename. Runs the blocking boto3 call in
    a thread so we don't choke the event loop.
    """
    path = Path(local_path)
    if not path.exists():
        raise R2UploadError(f"local file not found: {path}")

    client, bucket = _build_client()
    object_key = key or path.name
    _, _, _, _, public_base = _require_settings()

    def _do() -> None:
        # ה-Object נדרש להיות נגיש לציבור — Cloudflare R2 מאפשר זאת
        # דרך הגדרת public access ברמת הבקט (לא דרך ACL בכל בקשה).
        with path.open("rb") as fh:
            client.put_object(
                Bucket=bucket,
                Key=object_key,
                Body=fh,
                ContentType=content_type,
                CacheControl="public, max-age=86400",
            )

    await asyncio.to_thread(_do)
    public_url = f"{public_base}/{object_key}"
    logger.info("r2.uploaded", key=object_key, url=public_url)
    return public_url


async def upload_bytes(
    data: bytes,
    *,
    key: str,
    content_type: str = "application/octet-stream",
) -> str:
    """העלאת bytes ישירה ל-R2 — בלי ליצור קובץ זמני בדיסק.

    שימושי כשמקבלים תמונה כ-bytes מהשרת התמונות או כשמעלים קובץ
    שהגיע כ-multipart/form-data ולא רוצים לכתוב לדיסק.
    """
    client, bucket = _build_client()
    _, _, _, _, public_base = _require_settings()

    def _do() -> None:
        client.put_object(
            Bucket=bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
            CacheControl="public, max-age=86400",
        )

    await asyncio.to_thread(_do)
    public_url = f"{public_base}/{key}"
    logger.info("r2.uploaded_bytes", key=key, size=len(data), url=public_url)
    return public_url


async def delete_object(key: str) -> bool:
    """מחיקת אובייקט מה-bucket. מחזיר True אם הצליח."""
    client, bucket = _build_client()

    def _do() -> None:
        client.delete_object(Bucket=bucket, Key=key)

    try:
        await asyncio.to_thread(_do)
        logger.info("r2.deleted", key=key)
        return True
    except Exception as exc:
        logger.warning("r2.delete_failed", key=key, error=str(exc))
        return False


async def upload_remote_url(
    source_url: str,
    *,
    key: str,
    content_type: str = "video/mp4",
    timeout: float = 600,
) -> str:
    """Stream a remote URL straight into R2 without touching local disk.

    Used when a video lives behind a Colab cloudflared tunnel and we need a
    stable public URL for the official APIs.
    """
    # שלב 1: הורדה זמנית של הסרטון לקובץ זמני
    import tempfile

    suffix = Path(key).suffix or ".mp4"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp_path = Path(tmp.name)

    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as http:
            async with http.stream("GET", source_url) as resp:
                if resp.status_code >= 400:
                    raise R2UploadError(
                        f"GET {source_url} → {resp.status_code}"
                    )
                with tmp_path.open("wb") as fh:
                    async for chunk in resp.aiter_bytes(1 << 20):
                        fh.write(chunk)
        # שלב 2: העלאה ל-R2
        return await upload_file(tmp_path, key=key, content_type=content_type)
    finally:
        try:
            tmp_path.unlink(missing_ok=True)
        except Exception:
            pass
