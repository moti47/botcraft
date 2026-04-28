"""יצירת תמונת פנים קבועה עבור אווטאר.

הזרימה:
1. בונים פרומפט פורטרייט מתוך persona_dna.visual_style
2. קוראים ל-ImageClient (שרת Pollinations/Flux ב-Colab)
3. מורידים את ה-bytes
4. מעלים ל-Cloudflare R2 → URL ציבורי קבוע
5. מחזירים את ה-URL

הקריאה ל-ImageClient עטופה ב-tenacity כדי להתמודד עם 502 שזורמים מ-Pollinations.
אם כל הניסיונות נכשלים — מחזירים placeholder URL ומסמנים needs_face_regeneration.
"""
from __future__ import annotations

import uuid
from typing import Any

import httpx
from tenacity import (
    AsyncRetrying,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from core.logging import get_logger
from services.colab_client import ColabError, ColabUnavailable, ImageClient
from services.r2_uploader import R2Unavailable, R2UploadError, upload_bytes

logger = get_logger(__name__)


# Placeholder ציבורי — מוצג עד שהאווטאר מקבל פרצוף אמיתי
PLACEHOLDER_FACE_URL = (
    "https://placehold.co/1080x1350/1a1a1a/ffffff?text=Generating+Face..."
)


class AvatarImageError(Exception):
    """כל כשל ביצירת תמונת אווטאר."""


def build_portrait_prompt(dna: dict[str, Any]) -> str:
    """בונה פרומפט פורטרייט מהמבנה של persona_dna.

    הפרומפט מתאים בדיוק לתבנית שהמשתמש ביקש:
      "photorealistic portrait of {age}yo {ethnicity_look},
       {hair}, {eyes}, wearing {signature_outfit},
       {backdrop_style}, shot on Sony A7IV 85mm,
       natural lighting, 8k"

    כיוון שה-persona_generator הקיים יוצר מפתחות שונים (visual_style.hair וכו')
    אנחנו נופלים ל-fallback אם המפתחות החדשים לא קיימים — כך שגם אווטארים
    ישנים עדיין מקבלים פרומפט תקין.
    """
    visual_style = dna.get("visual_style") or {}

    age = (
        dna.get("age")
        or dna.get("age_appearance")
        or "27"
    )
    ethnicity = (
        dna.get("ethnicity_look")
        or dna.get("gender_presentation")
        or "young adult"
    )
    hair = visual_style.get("hair") or dna.get("hair") or "natural styled hair"
    eyes = visual_style.get("eyes") or dna.get("eyes") or "expressive eyes"
    signature_outfit = (
        dna.get("signature_outfit")
        or visual_style.get("outfit")
        or "modern casual outfit"
    )
    backdrop = (
        dna.get("backdrop_style")
        or visual_style.get("setting")
        or "soft studio backdrop"
    )

    return (
        f"photorealistic portrait of {age}yo {ethnicity}, "
        f"{hair}, {eyes}, "
        f"wearing {signature_outfit}, "
        f"{backdrop}, shot on Sony A7IV 85mm, "
        f"natural lighting, 8k"
    )


async def _download_image_bytes(url: str, *, timeout: float = 120) -> bytes:
    """הורדת קובץ תמונה כ-bytes מה-URL שמחזיר שרת ה-Image של Colab."""
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as http:
        resp = await http.get(url)
        if resp.status_code >= 400:
            raise AvatarImageError(
                f"download face image failed: GET {url} → {resp.status_code}"
            )
        return resp.content


def _style_prefix(style: str) -> str:
    """הוסף prefix לפרומפט בהתאם לסגנון שנבחר."""
    prefixes = {
        "realistic": "photorealistic portrait,",
        "anime": "anime style portrait, cel-shaded, vibrant colors,",
        "3d": "3D rendered portrait, octane render, subsurface scattering,",
        "cinematic": "cinematic portrait, dramatic lighting, film grain,",
        "cartoon": "cartoon illustration, flat design, bold outlines,",
    }
    return prefixes.get(style, "photorealistic portrait,")


async def generate_avatar_face(
    avatar_id: str,
    persona_dna: dict[str, Any],
    *,
    seed: int = 42,
    style: str = "realistic",
) -> tuple[str, bool]:
    """יצירה ושמירה של תמונת פנים לאווטאר.

    מחזיר ``(face_url, needs_regeneration)``:
      • אם הצליח — face_url הוא URL קבוע מ-R2, needs_regeneration=False
      • אם נכשל — face_url הוא placeholder, needs_regeneration=True

    שלוש ניסיונות עם backoff מעריכי (2s → 4s → 10s) כדי להתמודד עם 502
    ש-Pollinations מחזיר באקראי כשהשרת עמוס.
    """
    base_prompt = build_portrait_prompt(persona_dna)
    prompt = f"{_style_prefix(style)} {base_prompt}"
    image_client = ImageClient()
    job_id = f"avatar_{avatar_id}_{uuid.uuid4().hex[:8]}"

    # ----- שלב 1: ניסיון יצירת התמונה עם retry -----
    # tenacity יחזור גם על ColabError (502/timeout) וגם על AvatarImageError
    # בשלב ההורדה. בלי retry על ColabUnavailable כי זה אומר שה-URL לא הוגדר —
    # אין טעם לחזור אם אין שרת.
    try:
        async for attempt in AsyncRetrying(
            stop=stop_after_attempt(3),
            wait=wait_exponential(multiplier=1, min=2, max=10),
            retry=retry_if_exception_type((ColabError, AvatarImageError)),
            reraise=True,
        ):
            with attempt:
                logger.info(
                    "avatar_image.generate.attempt",
                    avatar_id=avatar_id,
                    attempt=attempt.retry_state.attempt_number,
                )
                result = await image_client.generate_avatar(
                    job_id=job_id,
                    prompt=prompt,
                    width=1080,
                    height=1350,
                    seed=seed,
                )
                # שרת ה-Image מחזיר url שאפשר להוריד ממנו
                source_url = (
                    result.get("url")
                    or image_client.download_url(job_id)
                )
                image_bytes = await _download_image_bytes(source_url)
    except ColabUnavailable as exc:
        logger.error(
            "avatar_image.colab_unavailable",
            avatar_id=avatar_id,
            error=str(exc),
        )
        return PLACEHOLDER_FACE_URL, True
    except Exception as exc:
        logger.exception(
            "avatar_image.generate.failed_all_retries",
            avatar_id=avatar_id,
        )
        return PLACEHOLDER_FACE_URL, True

    # ----- שלב 2: העלאה ל-R2 -----
    # שמים תחת avatars/{id}/face.png — קל לזהות ולהחליף בעתיד
    key = f"avatars/{avatar_id}/face.png"
    try:
        public_url = await upload_bytes(
            image_bytes,
            key=key,
            content_type="image/png",
        )
    except (R2Unavailable, R2UploadError) as exc:
        logger.error(
            "avatar_image.r2_upload_failed",
            avatar_id=avatar_id,
            error=str(exc),
        )
        # אם R2 לא זמין נשמור את ה-URL הזמני של Colab (פחות עמיד אך טוב מ-placeholder)
        return PLACEHOLDER_FACE_URL, True

    logger.info(
        "avatar_image.generated",
        avatar_id=avatar_id,
        url=public_url,
    )
    return public_url, False
