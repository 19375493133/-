from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

SessionStatus = Literal[
    "created",
    "recording",
    "uploading",
    "transcribing",
    "analyzing",
    "done",
    "failed",
    "pending_batch_transcribe",
]
HighlightType = Literal["important", "difficult", "question", "note"]
GlossaryCategory = Literal["course_term", "person", "abbreviation", "other"]
TranscriptSource = Literal["realtime", "batch"]
TranscriptStatus = Literal["interim", "final"]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class SessionCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    course: str = Field(default="", max_length=200)
    teacher: str = Field(default="", max_length=200)
    date: str = Field(default="", max_length=20)

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("title 不能为空")
        return value

    @field_validator("course", "teacher")
    @classmethod
    def strip_optional(cls, value: str) -> str:
        return value.strip()


class SessionUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    course: str | None = Field(default=None, max_length=200)
    teacher: str | None = Field(default=None, max_length=200)
    date: str | None = Field(default=None, max_length=20)


class SessionRead(ORMModel):
    id: str
    title: str
    course: str
    teacher: str
    date: str
    status: SessionStatus
    duration: int
    error_message: str | None = None
    merged_audio_url: str | None = None
    created_at: datetime
    updated_at: datetime


class SessionStatusRead(BaseModel):
    session_id: str
    status: SessionStatus
    duration: int
    error_message: str | None = None
    merged_audio_url: str | None = None


class RecordingChunkRead(ORMModel):
    id: str
    session_id: str
    chunk_id: str
    chunk_index: int
    start_offset_seconds: float
    end_offset_seconds: float
    size_bytes: int
    sha256: str
    created_at: datetime


class RecordingChunkUploadResponse(BaseModel):
    chunk: RecordingChunkRead
    duplicate: bool = False


class RecordingChunkBase64Upload(BaseModel):
    """给微信小程序云托管用：callContainer 只能发 JSON，所以分片用 base64 传。"""

    chunk_id: str = Field(min_length=1, max_length=64)
    chunk_index: int = Field(ge=0)
    start_offset_seconds: float = Field(default=0.0, ge=0)
    end_offset_seconds: float = Field(default=0.0, ge=0)
    content_type: str = Field(default="audio/wav", max_length=100)
    data_base64: str = Field(min_length=1)


class FinalizeResponse(BaseModel):
    session_id: str
    status: SessionStatus
    merged_audio_url: str | None = None
    duration: int


class FinalizeRequest(BaseModel):
    realtime_transcribe_enabled: bool = False


class TranscriptSegmentCreate(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    start_seconds: float = Field(default=0.0, ge=0)
    end_seconds: float = Field(default=0.0, ge=0)
    speaker: str | None = Field(default=None, max_length=100)
    source: TranscriptSource = "realtime"
    status: TranscriptStatus = "final"

    @field_validator("text")
    @classmethod
    def text_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("text 不能为空")
        return value


class TranscriptSegmentUpdate(BaseModel):
    text: str | None = Field(default=None, min_length=1, max_length=5000)
    speaker: str | None = Field(default=None, max_length=100)

    @field_validator("text")
    @classmethod
    def text_not_blank(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("text 不能为空")
        return value


class TranscriptSegmentRead(ORMModel):
    id: str
    session_id: str
    text: str
    start_seconds: float
    end_seconds: float
    speaker: str | None = None
    source: TranscriptSource
    status: TranscriptStatus
    edited: bool
    created_at: datetime


class HighlightCreate(BaseModel):
    type: HighlightType
    content: str = Field(min_length=1, max_length=2000)
    timestamp_seconds: float = Field(default=0.0, ge=0)
    speaker: str | None = Field(default=None, max_length=100)

    @field_validator("content")
    @classmethod
    def content_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("内容不能为空")
        return value

    @field_validator("speaker")
    @classmethod
    def strip_speaker(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None


class HighlightRead(ORMModel):
    id: str
    session_id: str
    type: HighlightType
    content: str
    timestamp_seconds: float
    speaker: str | None = None
    created_at: datetime


class GlossaryEntryCreate(BaseModel):
    term: str = Field(min_length=1, max_length=200)
    category: GlossaryCategory = "other"
    replacement: str = Field(default="", max_length=500)

    @field_validator("term")
    @classmethod
    def term_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("term 不能为空")
        return value


class GlossaryEntryRead(ORMModel):
    id: str
    term: str
    category: GlossaryCategory
    replacement: str
    created_at: datetime


class NotImplementedResponse(BaseModel):
    status: Literal["not_implemented"]
    message: str
    route: str


class MindMapOutlineRead(BaseModel):
    """思维导图用的大纲：markmap 直接渲染 `markdown`。"""

    session_id: str
    markdown: str
    source: Literal["local", "llm"]
    llm_configured: bool = False
    warning: str | None = None
    generated_at: datetime
    segment_count: int = 0
    highlight_count: int = 0


AnalysisCategory = Literal[
    "key_point", "difficult", "example", "homework", "exam", "term"
]


class AnalysisPointRead(BaseModel):
    category: AnalysisCategory
    text: str
    start_seconds: float = 0.0
    source: Literal["local", "llm"] = "local"


class AnalysisResponse(BaseModel):
    session_id: str
    source: Literal["local", "llm"]
    llm_configured: bool = False
    warning: str | None = None
    points: list[AnalysisPointRead]
    counts: dict[str, int] = {}
    generated_at: datetime
    segment_count: int = 0
    highlight_count: int = 0
