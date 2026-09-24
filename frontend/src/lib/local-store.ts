import type {
  Highlight,
  HighlightType,
  Session,
  TranscriptSegment,
} from "@/lib/types";

const SESSIONS_KEY = "classroom-listener.sessions.v1";
const HIGHLIGHTS_KEY = "classroom-listener.highlights.v1";
const TRANSCRIPTS_KEY = "classroom-listener.transcripts.v1";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readArray<T>(key: string): T[] {
  if (!canUseStorage()) {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function writeArray<T>(key: string, items: T[]): void {
  if (!canUseStorage()) {
    throw new Error("当前浏览器不支持本地存储");
  }
  window.localStorage.setItem(key, JSON.stringify(items));
}

function newId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function now(): string {
  return new Date().toISOString();
}

export function listLocalSessions(): Session[] {
  return readArray<Session>(SESSIONS_KEY).sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
}

export function createLocalSession(payload: {
  title: string;
  course: string;
  teacher: string;
  date: string;
}): Session {
  const session: Session = {
    id: newId(),
    title: payload.title.trim(),
    course: payload.course.trim(),
    teacher: payload.teacher.trim(),
    date: payload.date,
    status: "created",
    duration: 0,
    error_message: null,
    merged_audio_url: null,
    created_at: now(),
    updated_at: now(),
  };
  const sessions = readArray<Session>(SESSIONS_KEY);
  sessions.push(session);
  writeArray(SESSIONS_KEY, sessions);
  return session;
}

export function getLocalSession(id: string): Session | null {
  return readArray<Session>(SESSIONS_KEY).find((session) => session.id === id) ?? null;
}

export function updateLocalSession(
  id: string,
  payload: Partial<Pick<Session, "title" | "course" | "teacher" | "date">>,
): Session {
  const sessions = readArray<Session>(SESSIONS_KEY);
  const index = sessions.findIndex((session) => session.id === id);
  if (index < 0) {
    throw new Error("听课会话不存在");
  }
  const next: Session = {
    ...sessions[index],
    ...payload,
    updated_at: now(),
  };
  sessions[index] = next;
  writeArray(SESSIONS_KEY, sessions);
  return next;
}

export function deleteLocalSession(id: string): void {
  writeArray(
    SESSIONS_KEY,
    readArray<Session>(SESSIONS_KEY).filter((session) => session.id !== id),
  );
  writeArray(
    HIGHLIGHTS_KEY,
    readArray<Highlight>(HIGHLIGHTS_KEY).filter((item) => item.session_id !== id),
  );
  writeArray(
    TRANSCRIPTS_KEY,
    readArray<TranscriptSegment>(TRANSCRIPTS_KEY).filter(
      (item) => item.session_id !== id,
    ),
  );
}

export function updateLocalSessionStatus(
  id: string,
  patch: Partial<Pick<Session, "status" | "duration" | "error_message" | "merged_audio_url">>,
): Session {
  const sessions = readArray<Session>(SESSIONS_KEY);
  const index = sessions.findIndex((session) => session.id === id);
  if (index < 0) {
    throw new Error("听课会话不存在");
  }
  const next: Session = {
    ...sessions[index],
    ...patch,
    updated_at: now(),
  };
  sessions[index] = next;
  writeArray(SESSIONS_KEY, sessions);
  return next;
}

export function getLocalStatus(id: string): {
  session_id: string;
  status: Session["status"];
  duration: number;
  error_message: string | null;
  merged_audio_url: string | null;
} {
  const session = getLocalSession(id);
  if (!session) {
    throw new Error("听课会话不存在");
  }
  return {
    session_id: session.id,
    status: session.status,
    duration: session.duration,
    error_message: session.error_message,
    merged_audio_url: session.merged_audio_url,
  };
}

export function listLocalHighlights(sessionId: string): Highlight[] {
  return readArray<Highlight>(HIGHLIGHTS_KEY)
    .filter((item) => item.session_id === sessionId)
    .sort((a, b) => a.timestamp_seconds - b.timestamp_seconds);
}

export function addLocalHighlight(
  sessionId: string,
  payload: {
    type: HighlightType;
    content: string;
    timestamp_seconds: number;
    speaker?: string;
  },
): Highlight {
  const highlight: Highlight = {
    id: newId(),
    session_id: sessionId,
    type: payload.type,
    content: payload.content.trim(),
    timestamp_seconds: payload.timestamp_seconds,
    speaker: payload.speaker?.trim() || null,
    created_at: now(),
  };
  const highlights = readArray<Highlight>(HIGHLIGHTS_KEY);
  highlights.push(highlight);
  writeArray(HIGHLIGHTS_KEY, highlights);
  return highlight;
}

export function listLocalTranscriptSegments(sessionId: string): TranscriptSegment[] {
  return readArray<TranscriptSegment>(TRANSCRIPTS_KEY)
    .filter((item) => item.session_id === sessionId)
    .map((item) => ({
      ...item,
      source: item.source ?? "realtime",
      status: item.status ?? "final",
      edited: item.edited ?? false,
    }))
    .sort((a, b) => a.start_seconds - b.start_seconds);
}

export function addLocalTranscriptSegment(
  sessionId: string,
  payload: {
    text: string;
    startSeconds: number;
    endSeconds: number;
    speaker?: string;
    source?: "realtime" | "batch";
    status?: "interim" | "final";
  },
): TranscriptSegment {
  const segment: TranscriptSegment = {
    id: newId(),
    session_id: sessionId,
    text: payload.text.trim(),
    start_seconds: payload.startSeconds,
    end_seconds: payload.endSeconds,
    speaker: payload.speaker?.trim() || "老师",
    source: payload.source ?? "realtime",
    status: payload.status ?? "final",
    edited: false,
    created_at: now(),
  };
  const segments = readArray<TranscriptSegment>(TRANSCRIPTS_KEY);
  segments.push(segment);
  writeArray(TRANSCRIPTS_KEY, segments);
  return segment;
}

export function updateLocalTranscriptSegment(
  segmentId: string,
  patch: Pick<TranscriptSegment, "text"> &
    Partial<Pick<TranscriptSegment, "speaker" | "status" | "source">>,
): TranscriptSegment {
  const segments = readArray<TranscriptSegment>(TRANSCRIPTS_KEY);
  const index = segments.findIndex((item) => item.id === segmentId);
  if (index < 0) {
    throw new Error("转写片段不存在");
  }
  const next: TranscriptSegment = {
    ...segments[index],
    ...patch,
    source: patch.source ?? segments[index].source ?? "realtime",
    status: patch.status ?? segments[index].status ?? "final",
    edited: true,
  };
  segments[index] = next;
  writeArray(TRANSCRIPTS_KEY, segments);
  return next;
}

export function clearLocalTranscriptSegments(
  sessionId: string,
  preserveEdited = false,
): void {
  writeArray(
    TRANSCRIPTS_KEY,
    readArray<TranscriptSegment>(TRANSCRIPTS_KEY).filter(
      (item) =>
        item.session_id !== sessionId || (preserveEdited && Boolean(item.edited)),
    ),
  );
}

export function mergeSessions(remote: Session[], local: Session[]): Session[] {
  const sessions = new Map<string, Session>();
  for (const session of [...remote, ...local]) {
    sessions.set(session.id, session);
  }
  return [...sessions.values()].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
}
