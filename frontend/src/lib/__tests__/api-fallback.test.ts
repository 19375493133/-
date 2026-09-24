import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createSession,
  finalizeSession,
  isLocalMode,
  listSessions,
  normalizeApiBaseUrl,
  uploadChunk,
} from "@/lib/api";
import { listLocalAudioChunks } from "@/lib/local-audio";

describe("api base url", () => {
  it("defaults to the local backend", () => {
    expect(normalizeApiBaseUrl(undefined)).toBe("http://127.0.0.1:8000");
  });

  it("treats / as same-origin for the public tunnel build", () => {
    expect(normalizeApiBaseUrl("/")).toBe("");
    expect(normalizeApiBaseUrl("   ")).toBe("");
  });

  it("strips a trailing slash from an explicit url", () => {
    expect(normalizeApiBaseUrl("https://api.example.com/")).toBe(
      "https://api.example.com",
    );
  });
});

describe("api local fallback", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("creates a session in the browser when the backend is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );

    const created = await createSession({
      title: "编译原理",
      course: "计算机",
      teacher: "赵老师",
      date: "2026-09-17",
    });

    expect(created.title).toBe("编译原理");
    expect(isLocalMode()).toBe(true);

    const sessions = await listSessions();
    expect(sessions.some((item) => item.id === created.id)).toBe(true);
  });

  it("stores chunks and finalizes audio in the browser", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );

    const created = await createSession({
      title: "计算机网络",
      course: "计算机",
      teacher: "周老师",
      date: "2026-09-17",
    });

    await uploadChunk(created.id, {
      chunkId: "chunk-1",
      chunkIndex: 0,
      startOffsetSeconds: 0,
      endOffsetSeconds: 1,
      blob: new Blob(["part-1"], { type: "audio/webm" }),
    });
    await uploadChunk(created.id, {
      chunkId: "chunk-2",
      chunkIndex: 1,
      startOffsetSeconds: 1,
      endOffsetSeconds: 2,
      blob: new Blob(["part-2"], { type: "audio/webm" }),
    });

    const finalized = await finalizeSession(created.id);
    expect(finalized.status).toBe("done");
    expect(finalized.duration).toBe(2);
    expect(finalized.merged_audio_url).toMatch(/^local-audio:\/\//);
    expect(await listLocalAudioChunks(created.id)).toHaveLength(2);
  });
});
