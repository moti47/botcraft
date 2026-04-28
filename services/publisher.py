"""Social-platform publishers — official APIs only, avatar-token based.

כל פלטפורמה (YouTube / TikTok / Instagram) ממומשת כ-class עם החוזה:
``async upload(...) -> str`` — מחזיר את ה-ID של הפוסט בפלטפורמה.

הטוקנים מוזרמים מטבלת ``platform_tokens`` (per-avatar). אם אין טוקן —
ה-publisher עובר ל-fallback מ-env (לתאימות אחורה ולמצב single-tenant).

* :class:`YouTubePublisher` — YouTube Data API v3 (resumable upload, OAuth
  refresh token flow).
* :class:`TikTokPublisher` — TikTok Content Posting API v2.
* :class:`InstagramPublisher` — Instagram Graph API.

כולם:

* מסרבים לעלות בלי credentials (``PublisherUnavailable``).
* משתמשים ב-``services.rate_limiter`` עם המפתח החדש per-avatar+platform
  (15/יום, איפוס ב-UTC midnight).
* מתעדים כל שלב דרך structlog.
* בטוחים ל-instantiate בלי רשת — תקלות יקרו רק ב-``upload()``.

אין scraping, אין Selenium, אין endpoints לא רשמיים.
"""
from __future__ import annotations

import asyncio
import os
import subprocess
from pathlib import Path
from typing import Any

import httpx

from core.config import get_settings
from core.logging import get_logger
from services.rate_limiter import (
    RateLimitExceeded,
    check_or_raise,
    record_success,
)

logger = get_logger(__name__)


class PublisherUnavailable(Exception):
    """Required credentials are missing for this publisher."""


class PublisherError(Exception):
    """A platform API returned an error or the upload failed mid-flight."""


# =====================================================================
# Helpers
# =====================================================================

def _probe_duration_seconds(video_path: str | os.PathLike) -> float | None:
    """Best-effort ``ffprobe`` to detect Shorts eligibility (≤60s)."""
    try:
        out = subprocess.check_output(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                str(video_path),
            ],
            stderr=subprocess.STDOUT,
            timeout=15,
        )
        return float(out.strip())
    except (FileNotFoundError, subprocess.SubprocessError, ValueError):
        return None


# =====================================================================
# 1) YouTube
# =====================================================================

class YouTubePublisher:
    """Uploads via google-api-python-client with a refresh-token credential.

    הטוקנים: ``refresh_token`` בא מ-platform_tokens של האווטאר; client_id /
    client_secret הם של האפליקציה ומגיעים מ-env (משותפים לכל האווטארים).
    """

    SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]
    PLATFORM = "youtube"

    def __init__(
        self,
        *,
        avatar_id: str | None = None,
        access_token: str | None = None,
        refresh_token: str | None = None,
        account_id: str | None = None,
    ) -> None:
        s = get_settings()
        # client_id / client_secret תמיד מ-env — הם של ה-app ולא של האווטאר
        self._client_id = s.youtube_client_id
        self._client_secret = s.youtube_client_secret
        # refresh_token מועדף מ-platform_tokens; fallback ל-env
        self._refresh_token = refresh_token or s.youtube_refresh_token
        self._avatar_id = avatar_id
        self._account_id = account_id
        self._creds = None

    def _require(self) -> None:
        missing = [
            n for n, v in [
                ("YOUTUBE_CLIENT_ID", self._client_id),
                ("YOUTUBE_CLIENT_SECRET", self._client_secret),
                ("YOUTUBE_REFRESH_TOKEN", self._refresh_token),
            ] if not v
        ]
        if missing:
            raise PublisherUnavailable(f"missing YouTube creds: {', '.join(missing)}")

    def _build_credentials(self):
        from google.oauth2.credentials import Credentials

        return Credentials(
            token=None,
            refresh_token=self._refresh_token,
            client_id=self._client_id,
            client_secret=self._client_secret,
            token_uri="https://oauth2.googleapis.com/token",
            scopes=self.SCOPES,
        )

    async def refresh_token(self) -> None:
        """Force-refresh the OAuth access token before a sensitive call."""
        self._require()

        def _do() -> None:
            from google.auth.transport.requests import Request

            creds = self._creds or self._build_credentials()
            creds.refresh(Request())
            self._creds = creds
            logger.info("youtube.token_refreshed", avatar_id=self._avatar_id)

        await asyncio.to_thread(_do)

    async def upload(
        self,
        video_path: str | os.PathLike,
        title: str,
        description: str,
        tags: list[str] | None = None,
        thumbnail_path: str | os.PathLike | None = None,
    ) -> str:
        """Resumable upload + optional thumbnail. Returns the YouTube video id."""
        self._require()
        await check_or_raise(self._avatar_id, self.PLATFORM)

        path = Path(video_path)
        if not path.exists():
            raise PublisherError(f"video file not found: {path}")

        # ---- בדיקה אם הסרטון מתאים ל-Shorts (פחות מ-60 שניות) ----
        duration = _probe_duration_seconds(path)
        is_short = duration is not None and duration <= 60
        final_title = title if "#shorts" in title.lower() else (
            f"{title} #Shorts" if is_short else title
        )

        body: dict[str, Any] = {
            "snippet": {
                "title": final_title[:100],  # YouTube cap
                "description": description,
                "tags": tags or [],
                "categoryId": "22",  # People & Blogs
            },
            "status": {
                "privacyStatus": "public",
                "selfDeclaredMadeForKids": False,
            },
        }

        def _do_upload() -> str:
            from googleapiclient.discovery import build
            from googleapiclient.http import MediaFileUpload

            creds = self._creds or self._build_credentials()
            youtube = build("youtube", "v3", credentials=creds, cache_discovery=False)

            # resumable upload — חובה לקבצים מעל 5MB
            media = MediaFileUpload(
                str(path),
                chunksize=8 * 1024 * 1024,
                resumable=True,
                mimetype="video/mp4",
            )
            request = youtube.videos().insert(
                part="snippet,status", body=body, media_body=media,
            )
            response = None
            while response is None:
                status, response = request.next_chunk()
                if status:
                    logger.info(
                        "youtube.upload_progress",
                        progress=int(status.progress() * 100),
                    )
            video_id = response["id"]
            logger.info(
                "youtube.upload_done",
                video_id=video_id, avatar_id=self._avatar_id,
            )

            # ---- העלאת thumbnail (אופציונלית) ----
            if thumbnail_path:
                tpath = Path(thumbnail_path)
                if tpath.exists():
                    youtube.thumbnails().set(
                        videoId=video_id,
                        media_body=MediaFileUpload(str(tpath), mimetype="image/jpeg"),
                    ).execute()
                    logger.info("youtube.thumbnail_set", video_id=video_id)
                else:
                    logger.warning("youtube.thumbnail_missing", path=str(tpath))

            return video_id

        try:
            video_id = await asyncio.to_thread(_do_upload)
        except RateLimitExceeded:
            raise
        except Exception as exc:
            logger.exception("youtube.upload_failed")
            raise PublisherError(f"YouTube upload failed: {exc}") from exc

        await record_success(self._avatar_id, self.PLATFORM)
        return video_id


# =====================================================================
# 2) TikTok — Content Posting API v2
# =====================================================================

class TikTokPublisher:
    """Three-step flow: init → chunked PUT → status poll.

    ה-access_token מועבר per-avatar מטבלת platform_tokens.
    """

    BASE = "https://open.tiktokapis.com"
    PLATFORM = "tiktok"

    DEFAULT_CHUNK_SIZE = 10 * 1024 * 1024  # 10MB — בטווח ה-5-64MB ש-TikTok דורש
    POLL_INTERVAL_SEC = 4
    POLL_TIMEOUT_SEC = 600

    def __init__(
        self,
        *,
        avatar_id: str | None = None,
        access_token: str | None = None,
        refresh_token: str | None = None,
        account_id: str | None = None,
    ) -> None:
        s = get_settings()
        # client_key / client_secret של ה-app מ-env
        self._client_key = s.tiktok_client_key
        self._client_secret = s.tiktok_client_secret
        # access_token מועדף per-avatar; fallback ל-env
        self._access_token = access_token or s.tiktok_access_token
        self._refresh_token = refresh_token
        self._avatar_id = avatar_id
        self._account_id = account_id

    def _require(self) -> None:
        if not self._access_token:
            raise PublisherUnavailable("missing TIKTOK_ACCESS_TOKEN")

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._access_token}",
            "Content-Type": "application/json; charset=UTF-8",
        }

    async def upload(
        self,
        video_path: str | os.PathLike,
        caption: str,
        privacy: str = "SELF_ONLY",
    ) -> str:
        """Init → upload chunks → poll. Returns the TikTok publish_id."""
        self._require()
        await check_or_raise(self._avatar_id, self.PLATFORM)

        path = Path(video_path)
        if not path.exists():
            raise PublisherError(f"video file not found: {path}")

        size = path.stat().st_size
        chunk_size = min(self.DEFAULT_CHUNK_SIZE, size) if size else self.DEFAULT_CHUNK_SIZE
        total_chunks = (size + chunk_size - 1) // chunk_size if size else 1

        # ---- שלב 1: init — בקשה להתחיל פוסט ולקבל upload_url ----
        init_payload = {
            "post_info": {
                "title": caption[:2200],  # TikTok caption cap
                "privacy_level": privacy,
                "disable_duet": False,
                "disable_comment": False,
                "disable_stitch": False,
            },
            "source_info": {
                "source": "FILE_UPLOAD",
                "video_size": size,
                "chunk_size": chunk_size,
                "total_chunk_count": total_chunks,
            },
        }
        async with httpx.AsyncClient(timeout=60) as http:
            init_resp = await http.post(
                f"{self.BASE}/v2/post/publish/video/init/",
                headers=self._headers,
                json=init_payload,
            )
        if init_resp.status_code >= 400:
            raise PublisherError(
                f"tiktok init {init_resp.status_code}: {init_resp.text[:300]}"
            )
        init_data = init_resp.json().get("data") or {}
        upload_url = init_data.get("upload_url")
        publish_id = init_data.get("publish_id")
        if not upload_url or not publish_id:
            raise PublisherError(f"tiktok init missing upload_url/publish_id: {init_data}")
        logger.info("tiktok.init_ok", publish_id=publish_id, chunks=total_chunks)

        # ---- שלב 2: העלאת chunks ב-PUT עם Content-Range ----
        try:
            with path.open("rb") as fh:
                async with httpx.AsyncClient(timeout=600) as http:
                    for idx in range(total_chunks):
                        start = idx * chunk_size
                        end = min(start + chunk_size, size) - 1
                        fh.seek(start)
                        chunk = fh.read(end - start + 1)
                        put_resp = await http.put(
                            upload_url,
                            content=chunk,
                            headers={
                                "Content-Type": "video/mp4",
                                "Content-Length": str(len(chunk)),
                                "Content-Range": f"bytes {start}-{end}/{size}",
                            },
                        )
                        if put_resp.status_code not in (200, 201, 206):
                            raise PublisherError(
                                f"tiktok chunk {idx} → {put_resp.status_code}: {put_resp.text[:200]}"
                            )
                        logger.info(
                            "tiktok.chunk_uploaded",
                            publish_id=publish_id, idx=idx + 1, total=total_chunks,
                        )
        except httpx.HTTPError as exc:
            raise PublisherError(f"tiktok chunk transport error: {exc}") from exc

        # ---- שלב 3: polling עד PUBLISH_COMPLETE ----
        elapsed = 0
        while elapsed < self.POLL_TIMEOUT_SEC:
            await asyncio.sleep(self.POLL_INTERVAL_SEC)
            elapsed += self.POLL_INTERVAL_SEC
            try:
                async with httpx.AsyncClient(timeout=30) as http:
                    poll = await http.post(
                        f"{self.BASE}/v2/post/publish/status/fetch/",
                        headers=self._headers,
                        json={"publish_id": publish_id},
                    )
            except httpx.HTTPError as exc:
                logger.warning("tiktok.poll_transport_error", error=str(exc))
                continue
            if poll.status_code >= 400:
                raise PublisherError(f"tiktok poll {poll.status_code}: {poll.text[:200]}")
            data = poll.json().get("data") or {}
            status = (data.get("status") or "").upper()
            if status == "PUBLISH_COMPLETE":
                await record_success(self._avatar_id, self.PLATFORM)
                logger.info("tiktok.publish_complete", publish_id=publish_id)
                return publish_id
            if status in ("FAILED", "PUBLISH_FAILED"):
                raise PublisherError(f"tiktok publish failed: {data}")
            logger.debug("tiktok.poll", publish_id=publish_id, status=status)

        raise PublisherError(f"tiktok poll timeout after {self.POLL_TIMEOUT_SEC}s")


# =====================================================================
# 3) Instagram — Graph API
# =====================================================================

class InstagramPublisher:
    """Graph API Reels: container creation → status poll → publish.

    הטוקנים: access_token + account_id (IG Business ID) — שניהם per-avatar.
    """

    BASE = "https://graph.facebook.com/v21.0"
    PLATFORM = "instagram"

    POLL_INTERVAL_SEC = 5
    POLL_TIMEOUT_SEC = 600

    def __init__(
        self,
        *,
        avatar_id: str | None = None,
        access_token: str | None = None,
        refresh_token: str | None = None,
        account_id: str | None = None,
    ) -> None:
        s = get_settings()
        self._token = access_token or s.instagram_access_token
        self._account_id = account_id or s.instagram_account_id
        self._avatar_id = avatar_id

    def _require(self) -> None:
        missing = [
            n for n, v in [
                ("INSTAGRAM_ACCESS_TOKEN", self._token),
                ("INSTAGRAM_ACCOUNT_ID", self._account_id),
            ] if not v
        ]
        if missing:
            raise PublisherUnavailable(f"missing Instagram creds: {', '.join(missing)}")

    async def upload(self, video_url: str, caption: str) -> str:
        """video_url MUST be a public HTTPS URL (Instagram fetches it)."""
        self._require()
        await check_or_raise(self._avatar_id, self.PLATFORM)

        if not video_url.startswith(("https://", "http://")):
            raise PublisherError("Instagram requires a public http(s) video URL")

        # ---- שלב 1: יצירת media container ----
        async with httpx.AsyncClient(timeout=60) as http:
            create = await http.post(
                f"{self.BASE}/{self._account_id}/media",
                params={
                    "media_type": "REELS",
                    "video_url": video_url,
                    "caption": caption[:2200],
                    "access_token": self._token,
                },
            )
        if create.status_code >= 400:
            raise PublisherError(f"ig create {create.status_code}: {create.text[:300]}")
        creation_id = (create.json() or {}).get("id")
        if not creation_id:
            raise PublisherError(f"ig create missing id: {create.text[:200]}")
        logger.info("instagram.container_created", creation_id=creation_id)

        # ---- שלב 2: polling עד status_code == FINISHED ----
        elapsed = 0
        while elapsed < self.POLL_TIMEOUT_SEC:
            await asyncio.sleep(self.POLL_INTERVAL_SEC)
            elapsed += self.POLL_INTERVAL_SEC
            try:
                async with httpx.AsyncClient(timeout=30) as http:
                    poll = await http.get(
                        f"{self.BASE}/{creation_id}",
                        params={
                            "fields": "status_code,status",
                            "access_token": self._token,
                        },
                    )
            except httpx.HTTPError as exc:
                logger.warning("instagram.poll_transport_error", error=str(exc))
                continue
            if poll.status_code >= 400:
                raise PublisherError(f"ig poll {poll.status_code}: {poll.text[:200]}")
            data = poll.json() or {}
            status_code = (data.get("status_code") or "").upper()
            if status_code == "FINISHED":
                break
            if status_code in ("ERROR", "EXPIRED"):
                raise PublisherError(f"ig container failed: {data}")
            logger.debug("instagram.poll", creation_id=creation_id, status=status_code)
        else:
            raise PublisherError(f"ig container poll timeout after {self.POLL_TIMEOUT_SEC}s")

        # ---- שלב 3: פרסום בפועל ----
        async with httpx.AsyncClient(timeout=60) as http:
            publish = await http.post(
                f"{self.BASE}/{self._account_id}/media_publish",
                params={
                    "creation_id": creation_id,
                    "access_token": self._token,
                },
            )
        if publish.status_code >= 400:
            raise PublisherError(f"ig publish {publish.status_code}: {publish.text[:300]}")
        media_id = (publish.json() or {}).get("id")
        if not media_id:
            raise PublisherError(f"ig publish missing id: {publish.text[:200]}")

        await record_success(self._avatar_id, self.PLATFORM)
        logger.info("instagram.publish_done", media_id=media_id)
        return media_id


# =====================================================================
# Convenience factory
# =====================================================================

PUBLISHERS: dict[str, type] = {
    "youtube": YouTubePublisher,
    "tiktok": TikTokPublisher,
    "instagram": InstagramPublisher,
}


def get_publisher(
    platform: str,
    *,
    avatar_id: str | None = None,
    tokens: dict[str, Any] | None = None,
):
    """Return an instance of the matching publisher.

    ``tokens`` הוא רשומה מ-``platform_tokens`` (access_token / refresh_token /
    account_id). אם לא ניתן — ה-publisher יעבור ל-fallback מ-env.
    """
    cls = PUBLISHERS.get(platform.lower())
    if cls is None:
        raise KeyError(f"unknown platform: {platform!r}")
    tokens = tokens or {}
    return cls(
        avatar_id=avatar_id,
        access_token=tokens.get("access_token"),
        refresh_token=tokens.get("refresh_token"),
        account_id=tokens.get("account_id"),
    )
