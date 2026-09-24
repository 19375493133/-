import type {
  GlossaryEntry,
  Highlight,
  HighlightType,
  RecordingChunk,
  Session,
  TranscriptSegment,
} from "@/lib/types";
import * as localStore from "@/lib/local-store";
import * as localAudio from "@/lib/local-audio";
import { buildMindMap, mindMapToMarkdown } from "@/lib/mind-map";
import {
  countByCategory,
  extractLocalPoints,
  type AnalysisPoint,
} from "@/lib/analysis";

/**
 * 解析后端地址。
 *
 * - 不设置：本地默认直连 `http://127.0.0.1:8000`
 * - 设为 `/`（或空串）：使用同源相对路径，配合 next.config.mjs 的 /api 反向代理，
 *   手机走公网隧道时就不用把后端单独暴露出去。
 */
export function normalizeApiBaseUrl(raw: string | undefined): string {
  if (raw === undefined) {
    return "http://127.0.0.1:8000";
  }
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "/") {
    return "";
  }
  return trimmed.replace(/\/+$/, "");
}

const API_BASE_URL = normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL);
const WHISPER_API_URL = process.env.NEXT_PUBLIC_WHISPER_API_URL || "";
const WHISPER_API_KEY = process.env.NEXT_PUBLIC_WHISPER_API_KEY || "";
let localMode = false;

export function isLocalMode(): boolean {
  return localMode;
}

function shouldPreferLocalMode(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const host = window.location.hostname;
  const pageIsLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
  const apiIsLocal =
    API_BASE_URL.includes("127.0.0.1") || API_BASE_URL.includes("localhost");
  return !pageIsLocal && apiIsLocal;
}

function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) {
    return true;
  }
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return [
    "failed to fetch",
    "networkerror",
    "load failed",
    "fetch failed",
    "network request failed",
  ].some((item) => message.includes(item));
}

function shouldFallbackToLocal(error: unknown): boolean {
  return (
    isNetworkError(error) ||
    (error instanceof ApiError && [404, 501].includes(error.status))
  );
}

function resolveLocal<T>(fallback: () => T | Promise<T>): Promise<T> {
  localMode = true;
  return Promise.resolve(fallback());
}

export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(status: number, message: string, detail: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    let detail: unknown = response.statusText;
    try {
      const data = await response.json();
      detail = data.detail ?? data;
    } catch {
      // 忽略非 JSON 错误响应。
    }
    throw new ApiError(response.status, `请求失败：${response.statusText}`, detail);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

export function getWhisperApiUrl(): string {
  return WHISPER_API_URL;
}

export function listSessions(): Promise<Session[]> {
  if (shouldPreferLocalMode()) {
    return resolveLocal(() => localStore.listLocalSessions());
  }
  return request<Session[]>("/api/sessions")
    .then((remote) => localStore.mergeSessions(remote, localStore.listLocalSessions()))
    .catch((error) => {
      if (isNetworkError(error)) {
        return resolveLocal(() => localStore.listLocalSessions());
      }
      throw error;
    });
}

export function createSession(payload: {
  title: string;
  course: string;
  teacher: string;
  date: string;
}): Promise<Session> {
  if (shouldPreferLocalMode()) {
    return resolveLocal(() => localStore.createLocalSession(payload));
  }
  return request<Session>("/api/sessions", {
    method: "POST",
    body: JSON.stringify(payload),
  }).catch((error) => {
    if (isNetworkError(error)) {
      return resolveLocal(() => localStore.createLocalSession(payload));
    }
    throw error;
  });
}

export function getSession(id: string): Promise<Session> {
  if (shouldPreferLocalMode()) {
    return resolveLocal(() => {
      const local = localStore.getLocalSession(id);
      if (!local) {
        throw new ApiError(404, "听课会话不存在", "听课会话不存在");
      }
      return local;
    });
  }
  return request<Session>(`/api/sessions/${id}`).catch((error) => {
    const local = localStore.getLocalSession(id);
    if (local) {
      if (isNetworkError(error) || (error instanceof ApiError && error.status === 404)) {
        localMode = true;
        return local;
      }
    }
    if (isNetworkError(error)) {
      return resolveLocal(() => {
        const localSession = localStore.getLocalSession(id);
        if (!localSession) {
          throw new ApiError(404, "听课会话不存在", "听课会话不存在");
        }
        return localSession;
      });
    }
    throw error;
  });
}

export function updateSession(
  id: string,
  payload: Partial<Pick<Session, "title" | "course" | "teacher" | "date">>,
): Promise<Session> {
  if (shouldPreferLocalMode()) {
    return resolveLocal(() => localStore.updateLocalSession(id, payload));
  }
  return request<Session>(`/api/sessions/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  }).catch((error) => {
    if (isNetworkError(error)) {
      return resolveLocal(() => localStore.updateLocalSession(id, payload));
    }
    throw error;
  });
}

export function deleteSession(id: string): Promise<void> {
  if (shouldPreferLocalMode()) {
    return resolveLocal(() => {
      localStore.deleteLocalSession(id);
    });
  }
  return request<void>(`/api/sessions/${id}`, { method: "DELETE" }).catch((error) => {
    if (isNetworkError(error)) {
      return resolveLocal(() => {
        localStore.deleteLocalSession(id);
      });
    }
    throw error;
  });
}

export function getSessionStatus(id: string): Promise<{
  session_id: string;
  status: Session["status"];
  duration: number;
  error_message: string | null;
  merged_audio_url: string | null;
}> {
  if (shouldPreferLocalMode()) {
    return resolveLocal(() => localStore.getLocalStatus(id));
  }
  return request<{
    session_id: string;
    status: Session["status"];
    duration: number;
    error_message: string | null;
    merged_audio_url: string | null;
  }>(`/api/sessions/${id}/status`).catch((error) => {
    if (isNetworkError(error)) {
      return resolveLocal(() => localStore.getLocalStatus(id));
    }
    throw error;
  });
}

export function listHighlights(id: string): Promise<Highlight[]> {
  if (shouldPreferLocalMode()) {
    return resolveLocal(() => localStore.listLocalHighlights(id));
  }
  return request<Highlight[]>(`/api/sessions/${id}/highlights`).catch((error) => {
    if (isNetworkError(error)) {
      return resolveLocal(() => localStore.listLocalHighlights(id));
    }
    throw error;
  });
}

export function addHighlight(
  id: string,
  payload: {
    type: HighlightType;
    content: string;
    timestamp_seconds: number;
    speaker?: string;
  },
): Promise<Highlight> {
  if (shouldPreferLocalMode()) {
    return resolveLocal(() => localStore.addLocalHighlight(id, payload));
  }
  return request<Highlight>(`/api/sessions/${id}/highlights`, {
    method: "POST",
    body: JSON.stringify(payload),
  }).catch((error) => {
    if (isNetworkError(error)) {
      return resolveLocal(() => localStore.addLocalHighlight(id, payload));
    }
    throw error;
  });
}

export function listTranscriptSegments(id: string): Promise<TranscriptSegment[]> {
  if (shouldPreferLocalMode()) {
    return resolveLocal(() => localStore.listLocalTranscriptSegments(id));
  }
  return request<TranscriptSegment[]>(`/api/sessions/${id}/transcript`).then(
    (remote) =>
      remote.length > 0 ? remote : localStore.listLocalTranscriptSegments(id),
    (error) => {
      if (shouldFallbackToLocal(error)) {
        return resolveLocal(() => localStore.listLocalTranscriptSegments(id));
      }
      throw error;
    },
  );
}

export function addTranscriptSegment(
  id: string,
  payload: {
    text: string;
    startSeconds: number;
    endSeconds: number;
    speaker?: string;
    source?: "realtime" | "batch";
  },
): Promise<TranscriptSegment> {
  if (shouldPreferLocalMode()) {
    return resolveLocal(() => localStore.addLocalTranscriptSegment(id, payload));
  }
  return request<TranscriptSegment>(`/api/sessions/${id}/transcript`, {
    method: "POST",
    body: JSON.stringify({
      text: payload.text,
      start_seconds: payload.startSeconds,
      end_seconds: payload.endSeconds,
      speaker: payload.speaker ?? null,
      source: payload.source ?? "realtime",
      status: "final",
    }),
  }).catch((error) => {
    if (shouldFallbackToLocal(error)) {
      return resolveLocal(() =>
        localStore.addLocalTranscriptSegment(id, payload),
      );
    }
    throw error;
  });
}

export function updateTranscriptSegment(
  segmentId: string,
  payload: { text: string; speaker?: string | null },
): Promise<TranscriptSegment> {
  if (shouldPreferLocalMode()) {
    return resolveLocal(() =>
      localStore.updateLocalTranscriptSegment(segmentId, {
        text: payload.text,
        speaker: payload.speaker ?? undefined,
      }),
    );
  }
  return request<TranscriptSegment>(`/api/transcript/segments/${segmentId}`, {
    method: "PATCH",
    body: JSON.stringify({
      text: payload.text,
      speaker: payload.speaker ?? null,
    }),
  }).catch((error) => {
    if (shouldFallbackToLocal(error)) {
      return resolveLocal(() =>
        localStore.updateLocalTranscriptSegment(segmentId, {
          text: payload.text,
          speaker: payload.speaker ?? undefined,
        }),
      );
    }
    throw error;
  });
}

export interface MindMapOutline {
  session_id: string;
  markdown: string;
  source: "local" | "llm";
  llm_configured: boolean;
  warning: string | null;
  generated_at: string;
  segment_count: number;
  highlight_count: number;
}

function buildLocalMindMapOutline(id: string, warning: string | null): MindMapOutline {
  const session = localStore.getLocalSession(id);
  if (!session) {
    throw new ApiError(404, "听课会话不存在", "听课会话不存在");
  }
  const highlights = localStore.listLocalHighlights(id);
  const segments = localStore.listLocalTranscriptSegments(id);
  return {
    session_id: id,
    markdown: mindMapToMarkdown(buildMindMap(session, highlights, segments)),
    source: "local",
    llm_configured: false,
    warning,
    generated_at: new Date().toISOString(),
    segment_count: segments.length,
    highlight_count: highlights.length,
  };
}

/**
 * 取思维导图大纲（Markdown，交给 markmap 渲染）。
 *
 * - `prefer=local`：只要本地规则化大纲
 * - `prefer=llm`：配置了 LLM 就让模型直接输出 Markdown，失败自动回退并带上 warning
 * - 后端完全不可用时回退到浏览器本地生成的大纲（离线模式）
 */
export function getMindMapOutline(
  id: string,
  prefer: "auto" | "local" | "llm" = "auto",
): Promise<MindMapOutline> {
  if (shouldPreferLocalMode()) {
    return resolveLocal(() => buildLocalMindMapOutline(id, null));
  }
  return request<MindMapOutline>(
    `/api/sessions/${id}/mindmap?prefer=${prefer}`,
  ).catch((error) => {
    if (shouldFallbackToLocal(error)) {
      return resolveLocal(() =>
        buildLocalMindMapOutline(id, "后端不可用，当前为浏览器本地生成的大纲。"),
      );
    }
    throw error;
  });
}

export interface AnalysisResponse {
  session_id: string;
  source: "local" | "llm";
  llm_configured: boolean;
  warning: string | null;
  points: AnalysisPoint[];
  counts: Partial<Record<AnalysisPoint["category"], number>>;
  generated_at: string;
  segment_count: number;
  highlight_count: number;
}

function buildLocalAnalysis(id: string, warning: string | null): AnalysisResponse {
  const session = localStore.getLocalSession(id);
  if (!session) {
    throw new ApiError(404, "听课会话不存在", "听课会话不存在");
  }
  const highlights = localStore.listLocalHighlights(id);
  const segments = localStore.listLocalTranscriptSegments(id);
  const points = extractLocalPoints(highlights, segments);
  return {
    session_id: id,
    source: "local",
    llm_configured: false,
    warning,
    points,
    counts: countByCategory(points),
    generated_at: new Date().toISOString(),
    segment_count: segments.length,
    highlight_count: highlights.length,
  };
}

/**
 * 提取课堂重点（结构化要点）。
 *
 * 借鉴 open-notebook 的思路：先把内容整理成结构化要点存起来，
 * 再由 `/api/sessions/{id}/mindmap` 拼成 Markdown 交给 markmap 出图。
 */
export function analyzeSession(
  id: string,
  prefer: "auto" | "local" | "llm" = "auto",
): Promise<AnalysisResponse> {
  if (shouldPreferLocalMode()) {
    return resolveLocal(() => buildLocalAnalysis(id, null));
  }
  return request<AnalysisResponse>(
    `/api/sessions/${id}/analyze?prefer=${prefer}`,
    { method: "POST" },
  ).catch((error) => {
    if (shouldFallbackToLocal(error)) {
      return resolveLocal(() =>
        buildLocalAnalysis(id, "后端不可用，当前为浏览器本地规则提取的重点。"),
      );
    }
    throw error;
  });
}

export function listAnalysis(id: string): Promise<AnalysisPoint[]> {
  if (shouldPreferLocalMode()) {
    return resolveLocal(
      () => buildLocalAnalysis(id, null).points,
    );
  }
  return request<AnalysisPoint[]>(`/api/sessions/${id}/analysis`).catch((error) => {
    if (shouldFallbackToLocal(error)) {
      return resolveLocal(() => buildLocalAnalysis(id, null).points);
    }
    throw error;
  });
}

async function postAudioToWhisper(
  blob: Blob,
  language: string,
): Promise<{ segments?: Array<{ text: string; start: number; end: number }> }> {
  const extension = blob.type.includes("mp4")
    ? "mp4"
    : blob.type.includes("wav")
      ? "wav"
      : "webm";
  const form = new FormData();
  form.append("file", blob, `recording.${extension}`);
  form.append("language", language);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 600_000);
  try {
    const response = await fetch(`${WHISPER_API_URL}/api/transcribe`, {
      method: "POST",
      headers: WHISPER_API_KEY ? { "X-API-Key": WHISPER_API_KEY } : undefined,
      body: form,
      signal: controller.signal,
    });
    if (!response.ok) {
      let detail = response.statusText;
      try {
        const data = (await response.json()) as { detail?: string };
        detail = data.detail || detail;
      } catch {
        // Ignore non-JSON error responses.
      }
      throw new Error(`Whisper 转写失败：${detail}`);
    }
    return (await response.json()) as {
      segments?: Array<{ text: string; start: number; end: number }>;
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Whisper 转写超时，请缩短录音或稍后重试。");
    }
    if (isNetworkError(error)) {
      throw new Error("无法连接免费 Whisper 后端，隧道可能已断开，请稍后重试。");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function postAudioToWhisperWithRetry(
  blob: Blob,
  language: string,
): Promise<{ segments?: Array<{ text: string; start: number; end: number }> }> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await postAudioToWhisper(blob, language);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const retryable =
        isNetworkError(error) ||
        message.includes("无法连接") ||
        message.includes("timeout") ||
        message.includes("超时") ||
        message.includes("Unexpected end of JSON") ||
        message.includes("Failed to fetch");
      if (!retryable || attempt === 3) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 1200));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Whisper 转写失败");
}

export async function transcribeWithWhisper(
  id: string,
  blob: Blob,
  language = "zh",
  onProgress?: (current: number, total: number) => void,
): Promise<TranscriptSegment[]> {
  if (!WHISPER_API_URL) {
    throw new Error(
      "未配置免费 Whisper 后端。请先部署 whisper_backend，并设置 NEXT_PUBLIC_WHISPER_API_URL。",
    );
  }

  // 重新转写前清空旧结果，避免重复片段。
  localStore.clearLocalTranscriptSegments(id);
  const segments: TranscriptSegment[] = [];
  const data = await postAudioToWhisperWithRetry(blob, language);
  for (const segment of data.segments ?? []) {
    if (!segment.text.trim()) {
      continue;
    }
    segments.push(
      localStore.addLocalTranscriptSegment(id, {
        text: segment.text,
        startSeconds: segment.start,
        endSeconds: segment.end,
        speaker: "老师",
      }),
    );
  }
  onProgress?.(1, 1);

  localMode = true;
  return segments;
}

export async function transcribeSessionAudio(
  id: string,
  session: Session,
  onProgress?: (current: number, total: number) => void,
): Promise<TranscriptSegment[]> {
  let audioBlob: Blob | null = null;
  const localAudioFile = await localAudio.getLocalAudio(id);
  if (localAudioFile) {
    audioBlob = localAudioFile.blob;
  } else if (
    session.merged_audio_url &&
    !session.merged_audio_url.startsWith("local-audio://")
  ) {
    const response = await fetch(`${API_BASE_URL}${session.merged_audio_url}`);
    if (!response.ok) {
      throw new Error("无法读取合并后的录音文件");
    }
    audioBlob = await response.blob();
  }
  if (!audioBlob) {
    throw new Error("没有找到可转写的录音，请先完成一次录音。");
  }
  return transcribeWithWhisper(id, audioBlob, "zh", onProgress);
}

export function listChunks(id: string): Promise<RecordingChunk[]> {
  if (shouldPreferLocalMode()) {
    return resolveLocal(() => localAudio.listLocalAudioChunks(id));
  }
  return request<RecordingChunk[]>(`/api/sessions/${id}/chunks`).catch((error) => {
    if (isNetworkError(error)) {
      return resolveLocal(() => localAudio.listLocalAudioChunks(id));
    }
    throw error;
  });
}

export function uploadChunk(
  id: string,
  payload: {
    chunkId: string;
    chunkIndex: number;
    startOffsetSeconds: number;
    endOffsetSeconds: number;
    blob: Blob;
  },
): Promise<{ chunk: RecordingChunk; duplicate: boolean }> {
  const form = new FormData();
  form.append("chunk_id", payload.chunkId);
  form.append("chunk_index", String(payload.chunkIndex));
  form.append("start_offset_seconds", String(payload.startOffsetSeconds));
  form.append("end_offset_seconds", String(payload.endOffsetSeconds));
  form.append("file", payload.blob, `chunk-${payload.chunkIndex}.webm`);
  if (shouldPreferLocalMode()) {
    return resolveLocal(async () => {
      const chunk = await localAudio.saveLocalAudioChunk(id, payload);
      localStore.updateLocalSessionStatus(id, {
        status: "recording",
        duration: Math.round(payload.endOffsetSeconds),
      });
      return { chunk, duplicate: false };
    });
  }
  return request<{ chunk: RecordingChunk; duplicate: boolean }>(
    `/api/sessions/${id}/chunks`,
    {
      method: "POST",
      body: form,
    },
  ).catch((error) => {
    if (isNetworkError(error)) {
      return resolveLocal(async () => {
        const chunk = await localAudio.saveLocalAudioChunk(id, payload);
        localStore.updateLocalSessionStatus(id, {
          status: "recording",
          duration: Math.round(payload.endOffsetSeconds),
        });
        return { chunk, duplicate: false };
      });
    }
    throw error;
  });
}

export function finalizeSession(
  id: string,
  realtimeTranscribeEnabled = false,
): Promise<{
  session_id: string;
  status: Session["status"];
  merged_audio_url: string | null;
  duration: number;
}> {
  if (shouldPreferLocalMode()) {
    return resolveLocal(async () => {
      const audio = await localAudio.mergeLocalAudioChunks(id);
      const duration = Math.round(audio.duration);
      const mergedAudioUrl = `local-audio://${id}`;
      const hasRealtimeFinal = localStore
        .listLocalTranscriptSegments(id)
        .some(
          (segment) =>
            segment.source === "realtime" && segment.status === "final",
        );
      const nextStatus =
        realtimeTranscribeEnabled && !hasRealtimeFinal
          ? ("pending_batch_transcribe" as const)
          : ("done" as const);
      localStore.updateLocalSessionStatus(id, {
        status: nextStatus,
        duration,
        merged_audio_url: mergedAudioUrl,
        error_message: null,
      });
      return {
        session_id: id,
        status: nextStatus,
        merged_audio_url: mergedAudioUrl,
        duration,
      };
    });
  }
  return request<{
    session_id: string;
    status: Session["status"];
    merged_audio_url: string | null;
    duration: number;
  }>(`/api/sessions/${id}/finalize`, {
    method: "POST",
    body: JSON.stringify({
      realtime_transcribe_enabled: realtimeTranscribeEnabled,
    }),
  }).catch((error) => {
    if (isNetworkError(error)) {
      return resolveLocal(async () => {
        const audio = await localAudio.mergeLocalAudioChunks(id);
        const duration = Math.round(audio.duration);
        const mergedAudioUrl = `local-audio://${id}`;
        const hasRealtimeFinal = localStore
          .listLocalTranscriptSegments(id)
          .some(
            (segment) =>
              segment.source === "realtime" && segment.status === "final",
          );
        const nextStatus =
          realtimeTranscribeEnabled && !hasRealtimeFinal
            ? ("pending_batch_transcribe" as const)
            : ("done" as const);
        localStore.updateLocalSessionStatus(id, {
          status: nextStatus,
          duration,
          merged_audio_url: mergedAudioUrl,
          error_message: null,
        });
        return {
          session_id: id,
          status: nextStatus,
          merged_audio_url: mergedAudioUrl,
          duration,
        };
      });
    }
    throw error;
  });
}

export function listGlossary(): Promise<GlossaryEntry[]> {
  return request<GlossaryEntry[]>("/api/glossary");
}

export function addGlossary(payload: {
  term: string;
  category: GlossaryEntry["category"];
  replacement: string;
}): Promise<GlossaryEntry> {
  return request<GlossaryEntry>("/api/glossary", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteGlossary(id: string): Promise<void> {
  return request<void>(`/api/glossary/${id}`, { method: "DELETE" });
}
