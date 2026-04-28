"""ראוטר scheduler — חושף את ה-status של כל ה-jobs הפעילים."""
from __future__ import annotations

from fastapi import APIRouter

from app.schemas.models import SchedulerStatusResponse
from services.scheduler import get_scheduler

router = APIRouter(prefix="/scheduler", tags=["scheduler"])


@router.get("/status", response_model=SchedulerStatusResponse)
async def scheduler_status() -> SchedulerStatusResponse:
    """מחזיר את כל ה-jobs המתוזמנים — מסודרים לפי avatar_id.

    הדשבורד משתמש בזה כדי להציג למשתמש 'מה ירוץ הבא'.
    """
    scheduler = await get_scheduler()
    return SchedulerStatusResponse(**scheduler.status())
