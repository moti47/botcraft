"""יצירת תמונת פנים קבועה עבור אווטאר.

הזרימה:
1. בונים פרומפט פורטרייט מתוך persona_dna.visual_style
2. קוראים ל-Pollinations.ai (חינם, ללא API key) ליצירת PNG
3. מעלים ל-Cloudflare R2 → URL ציבורי קבוע
4. מחזירים את ה-URL

הקריאה ל-Pollinations עטופה ב-tenacity כדי להתמודד עם 502 שזורמים מ-Pollinations
כשהשרת עמוס. אם כל הניסיונות נכשלים — מחזירים placeholder URL ומסמנים
needs_face_regeneration כדי שהדשבורד יוכל להציע ניסיון חוזר.
"""
from __future__ import annotations

from typing import Any

from tenacity import (
    AsyncRetrying,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from core.logging import get_logger
from services.providers import pollinations_image
from services.providers.base import ProviderError, ProviderUnavailable
from services.r2_uploader import R2Unavailable, R2UploadError, upload_bytes

logger = get_logger(__name__)


# Placeholder ציבורי — מוצג עד שהאווטאר מקבל פרצוף אמיתי
PLACEHOLDER_FACE_URL = (
    "https://placehold.co/1080x1350/1a1a1a/ffffff?text=Generating+Face..."
)


class AvatarImageError(Exception):
    """כל כשל ביצירת תמונת אווטאר."""


def build_portrait_prompt(dna: dict[str, Any]) -> str:
    """בונה פרומפט פורטרייט מהמבנה של persona_dna."""
    visual_style = dna.get("visual_style") or {}

    age = dna.get("age") or dna.get("age_appearance") or "27"
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
    """
    base_prompt = build_portrait_prompt(persona_dna)
    prompt = f"{_style_prefix(style)} {base_prompt}"

    # ----- שלב 1: ניסיון יצירת התמונה עם retry -----
    image_bytes: bytes | None = None
    try:
        async for attempt in AsyncRetrying(
            stop=stop_after_attempt(3),
            wait=wait_exponential(multiplier=1, min=2, max=10),
            retry=retry_if_exception_type(ProviderError),
            reraise=True,
        ):
            with attempt:
                logger.info(
                    "avatar_image.generate.attempt",
                    avatar_id=avatar_id,
                    attempt=attempt.retry_state.attempt_number,
                )
                result = await pollinations_image.generate(
                    prompt,
                    width=1080,
                    height=1350,
                    seed=seed,
                )
                image_bytes = result.bytes_inline
    except ProviderUnavailable as exc:
        # Pollinations doesn't require auth so this is rare
        logger.error("avatar_image.provider_unavailable", avatar_id=avatar_id, error=str(exc))
        return PLACEHOLDER_FACE_URL, True
    except Exception:
        logger.exception("avatar_image.generate.failed_all_retries", avatar_id=avatar_id)
        return PLACEHOLDER_FACE_URL, True

    if not image_bytes:
        return PLACEHOLDER_FACE_URL, True

    # ----- שלב 2: העלאה ל-R2 -----
    key = f"avatars/{avatar_id}/face.png"
    try:
        public_url = await upload_bytes(
            image_bytes,
            key=key,
            content_type="image/png",
        )
    except (R2Unavailable, R2UploadError) as exc:
        logger.error("avatar_image.r2_upload_failed", avatar_id=avatar_id, error=str(exc))
        return PLACEHOLDER_FACE_URL, True

    logger.info("avatar_image.generated", avatar_id=avatar_id, url=public_url)
    return public_url, False
