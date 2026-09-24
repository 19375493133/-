export type SessionStatus =
  | "created"
  | "recording"
  | "uploading"
  | "transcribing"
  | "analyzing"
  | "done"
  | "failed"
  | "pending_batch_transcribe";

export type HighlightType = "important" | "difficult" | "question" | "note";

export interface Session {
  id: string;
  title: string;
  course: string;
  teacher: string;
  date: string;
  status: SessionStatus;
  duration: number;
  error_message: string | null;
  merged_audio_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Highlight {
  id: string;
  session_id: string;
  type: HighlightType;
  content: string;
  timestamp_seconds: number;
  speaker: string | null;
  created_at: string;
}

export interface RecordingChunk {
  id: string;
  session_id: string;
  chunk_id: string;
  chunk_index: number;
  start_offset_seconds: number;
  end_offset_seconds: number;
  size_bytes: number;
  sha256: string;
  created_at: string;
}

export interface TranscriptSegment {
  id: string;
  session_id: string;
  text: string;
  start_seconds: number;
  end_seconds: number;
  speaker: string | null;
  source: "realtime" | "batch";
  status: "interim" | "final";
  edited: boolean;
  created_at: string;
}

export type ASRProviderName = "funasr" | "webspeech" | "backend_ws" | "mock";

export interface ASRSettings {
  realtimeEnabled: boolean;
  provider: ASRProviderName;
  language: "zh" | "en";
}

export interface GlossaryEntry {
  id: string;
  term: string;
  category: "course_term" | "person" | "abbreviation" | "other";
  replacement: string;
  created_at: string;
}
