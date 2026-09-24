import { beforeEach, describe, expect, it } from "vitest";

import {
  addLocalTranscriptSegment,
  clearLocalTranscriptSegments,
  addLocalHighlight,
  createLocalSession,
  deleteLocalSession,
  getLocalSession,
  listLocalHighlights,
  listLocalSessions,
  listLocalTranscriptSegments,
} from "@/lib/local-store";

describe("local store", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("creates and reads a session without a backend", () => {
    const created = createLocalSession({
      title: "数据结构",
      course: "计算机",
      teacher: "王老师",
      date: "2026-09-17",
    });

    expect(created.status).toBe("created");
    expect(getLocalSession(created.id)?.title).toBe("数据结构");
    expect(listLocalSessions()).toHaveLength(1);
  });

  it("adds highlights and removes them with the session", () => {
    const created = createLocalSession({
      title: "操作系统",
      course: "计算机",
      teacher: "李老师",
      date: "2026-09-17",
    });

    addLocalHighlight(created.id, {
      type: "important",
      content: "进程和线程的区别",
      timestamp_seconds: 12,
    });

    expect(listLocalHighlights(created.id)).toHaveLength(1);
    deleteLocalSession(created.id);
    expect(getLocalSession(created.id)).toBeNull();
    expect(listLocalHighlights(created.id)).toHaveLength(0);
  });

  it("stores transcript segments with timestamps", () => {
    const created = createLocalSession({
      title: "大学物理",
      course: "物理",
      teacher: "陈老师",
      date: "2026-09-17",
    });

    addLocalTranscriptSegment(created.id, {
      text: "牛顿第一定律也叫惯性定律",
      startSeconds: 3,
      endSeconds: 8,
      speaker: "老师",
    });

    const segments = listLocalTranscriptSegments(created.id);
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toContain("牛顿第一定律");
    expect(segments[0].start_seconds).toBe(3);

    clearLocalTranscriptSegments(created.id);
    expect(listLocalTranscriptSegments(created.id)).toHaveLength(0);
  });
});
