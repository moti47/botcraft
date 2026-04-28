from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from pydantic import BaseModel, Field


# ---------- Avatars ----------

class AvatarCreateRequest(BaseModel):
    niche: str = Field(..., min_length=2, max_length=120)
    language: str = Field(default="en", min_length=2, max_length=10)
    tone: str | None = Field(default=None, max_length=50)
    avatar_style: str = Field(default="realistic")


class AvatarUpdateRequest(BaseModel):
    name: str | None = None
    handle: str | None = None
    niche: str | None = None
    language: str | None = None
    persona_dna: dict[str, Any] | None = None
    status: str | None = None
    is_paused: bool | None = None
    auto_publish: bool | None = None
    avatar_style: str | None = None
    face_url: str | None = None
    needs_face_regeneration: bool | None = None
    short_video_schedule: dict[str, Any] | None = None
    long_video_schedule: dict[str, Any] | None = None
    post_schedule: dict[str, Any] | None = None


class AvatarOut(BaseModel):
    id: str
    name: str | None = None
    handle: str | None = None
    niche: str | None = None
    language: str | None = None
    persona_dna: dict[str, Any] | None = None
    generator_provider: str | None = None
    generator_model: str | None = None
    status: str | None = "active"
    is_paused: bool = False
    auto_publish: bool = False
    avatar_style: str = "realistic"
    face_url: str | None = None
    needs_face_regeneration: bool = False
    short_video_schedule: dict[str, Any] | None = None
    long_video_schedule: dict[str, Any] | None = None
    post_schedule: dict[str, Any] | None = None
    # platforms מוזרק דרך join — לא עמודה ישירה בטבלת avatars
    platforms: dict[str, dict[str, Any]] = Field(default_factory=dict)
    videos_this_week: int | None = None
    avg_score: float | None = None
    created_at: str | None = None


# ---------- Scripts ----------

class ScriptGenerateRequest(BaseModel):
    avatar_id: str = Field(..., description="UUID of the avatar")
    topic: str = Field(..., min_length=3, max_length=240)


class ScriptOut(BaseModel):
    id: str
    avatar_id: str
    topic: str | None = None
    title: str | None = None
    script: dict[str, Any] | None = None
    language: str | None = None
    provider: str | None = None
    model: str | None = None
    status: str | None = None
    created_at: str | None = None


# ---------- Trends ----------

class TrendOut(BaseModel):
    id: str
    keyword: str | None = None
    platform: str | None = None
    score: float | None = None
    source: str | None = None
    payload: dict[str, Any] | None = None
    created_at: str | None = None


# ---------- Videos ----------

class VideoQueueRequest(BaseModel):
    script_id: str = Field(..., description="UUID of the script to render into video")
    voice_ref_filename: str = Field(..., description="Voice reference filename on the TTS server.")
    avatar_id: str | None = None
    priority: int = Field(default=5, ge=1, le=10)
    render_options: dict[str, Any] = Field(default_factory=dict)


class VideoQueueResponse(BaseModel):
    job_id: str
    queue: str
    position: int
    status: str = "queued"


class VideoProduceRequest(BaseModel):
    avatar_id: str = Field(..., description="UUID of the avatar to animate")
    topic: str = Field(..., min_length=3, max_length=240)
    voice: str = Field(default="af_bella")
    auto_post: bool = Field(default=False)


class VideoProduceResponse(BaseModel):
    video_id: str
    status: str = "queued"
    message: str = "Pipeline started"


class VideoStageTimestamps(BaseModel):
    queued: str | None = None
    script_ready: str | None = None
    tts_done: str | None = None
    image_done: str | None = None
    lipsync_done: str | None = None
    ready: str | None = None
    failed: str | None = None


class VideoStatusResponse(BaseModel):
    video_id: str
    status: str
    stages: VideoStageTimestamps
    error_message: str | None = None
    video_url: str | None = None
    face_url: str | None = None
    audio_url: str | None = None


class VideoOut(BaseModel):
    id: str | None = None
    job_id: str | None = None
    script_id: str | None = None
    avatar_id: str | None = None
    status: str | None = None
    video_url: str | None = None
    thumbnail_url: str | None = None
    face_url: str | None = None
    audio_url: str | None = None
    final_path: str | None = None
    duration_sec: float | None = None
    error_message: str | None = None
    render_options: dict[str, Any] | None = None
    created_at: str | None = None


class ColabHealthResponse(BaseModel):
    tts: dict[str, Any] | str
    image: dict[str, Any] | str
    lipsync: dict[str, Any] | str


# ---------- Posts / Publishing ----------

PlatformLiteral = Literal["youtube", "tiktok", "instagram"]


class PostPublishRequest(BaseModel):
    video_id: str = Field(..., description="UUID of the videos row to publish")
    caption: str = Field("", max_length=2200)
    hashtags: list[str] = Field(default_factory=list)
    schedule_at: datetime | None = Field(default=None)


class PostPlatformResult(BaseModel):
    status: str  # posted | skipped | failed | rate_limited | scheduled
    post_id: str | None = None
    reason: str | None = None
    retry_after_seconds: int | None = None


class PostPublishResponse(BaseModel):
    video_id: str
    results: dict[str, PostPlatformResult] = Field(default_factory=dict)


# ---------- Platform tokens ----------

class PlatformConnectRequest(BaseModel):
    platform: PlatformLiteral
    access_token: str | None = None
    refresh_token: str | None = None
    account_id: str | None = None
    token_expires_at: datetime | None = None
    is_active: bool = True


class PlatformTokenOut(BaseModel):
    id: str
    avatar_id: str
    platform: str
    account_id: str | None = None
    is_active: bool = True
    token_expires_at: str | None = None
    created_at: str | None = None


class PlatformDisconnectResponse(BaseModel):
    avatar_id: str
    platform: str
    removed: bool


class PostStatusItem(BaseModel):
    id: str
    platform: str
    status: str
    platform_post_id: str | None = None
    publish_error: str | None = None
    retry_count: int | None = None
    posted_at: str | None = None
    scheduled_for: str | None = None
    created_at: str | None = None


class PostStatusResponse(BaseModel):
    video_id: str
    posts: list[PostStatusItem]


# ---------- Avatar commands ----------

class AvatarCommandCreate(BaseModel):
    command_text: str = Field(..., min_length=1, max_length=2000)
    priority: int = Field(default=5, ge=1, le=10)
    is_active: bool = True


class AvatarCommandUpdate(BaseModel):
    command_text: str | None = None
    priority: int | None = None
    is_active: bool | None = None


class AvatarCommandOut(BaseModel):
    id: str
    avatar_id: str
    command_text: str
    priority: int = 5
    is_active: bool = True
    created_at: str | None = None


# ---------- Avatar files ----------

class AvatarFileUpdate(BaseModel):
    description: str | None = None


class AvatarFileOut(BaseModel):
    id: str
    avatar_id: str
    filename: str
    file_url: str
    file_type: str | None = None
    file_size_bytes: int | None = None
    description: str | None = None
    uploaded_at: str | None = None


# ---------- Avatar ideas ----------

class AvatarIdeaCreate(BaseModel):
    idea_text: str = Field(..., min_length=1, max_length=1000)
    source: str = Field(default="manual")


class AvatarIdeaOut(BaseModel):
    id: str
    avatar_id: str
    idea_text: str
    source: str = "manual"
    is_used: bool = False
    created_at: str | None = None


# ---------- Notifications ----------

class NotificationOut(BaseModel):
    id: str
    avatar_id: str | None = None
    type: str = "info"
    title: str
    message: str | None = None
    level: str = "info"
    is_read: bool = False
    payload: dict[str, Any] = Field(default_factory=dict)
    created_at: str | None = None


class NotificationCreate(BaseModel):
    avatar_id: str | None = None
    type: str = "info"
    title: str
    message: str | None = None
    level: str = "info"
    payload: dict[str, Any] = Field(default_factory=dict)


# ---------- Push subscriptions ----------

class PushSubscriptionCreate(BaseModel):
    endpoint: str
    keys: dict[str, str]
    user_agent: str | None = None


# ---------- Chat ----------

class ChatMessageOut(BaseModel):
    id: str
    role: str
    content: str
    actions_taken: list[dict[str, Any]] = Field(default_factory=list)
    created_at: str | None = None


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)


class ChatResponse(BaseModel):
    reply: str
    actions_taken: list[dict[str, Any]] = Field(default_factory=list)


# ---------- Health / Usage ----------

class HealthResponse(BaseModel):
    status: str
    redis: str
    supabase: str
    env: str


class LLMUsageResponse(BaseModel):
    usage: dict[str, Any]


# ---------- Image regeneration ----------

class RegenerateImageRequest(BaseModel):
    avatar_style: str | None = None
    seed: int | None = None


class RegenerateImageResponse(BaseModel):
    avatar_id: str
    face_url: str
    needs_face_regeneration: bool


# ---------- Avatar duplicate ----------

class AvatarDuplicateRequest(BaseModel):
    name: str | None = None
    language: str | None = None
    niche: str | None = None


# ---------- Scheduler ----------

class SchedulerStatusResponse(BaseModel):
    running: bool
    tz: str = "Asia/Jerusalem"
    total_jobs: int = 0
    by_avatar: dict = {}
