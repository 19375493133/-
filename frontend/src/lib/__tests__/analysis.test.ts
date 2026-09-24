import { describe, expect, it } from "vitest";

import { countByCategory, extractLocalPoints } from "@/lib/analysis";
import type { Highlight, TranscriptSegment } from "@/lib/types";

const highlights: Highlight[] = [
  {
    id: "h1",
    session_id: "s1",
    type: "important",
    content: "随机事件、必然事件、不可能事件的定义",
    timestamp_seconds: 45,
    speaker: "李老师",
    created_at: "2026-09-19T00:00:00.000Z",
  },
  {
    id: "h2",
    session_id: "s1",
    type: "difficult",
    content: "独立性与互不相容容易混淆",
    timestamp_seconds: 320,
    speaker: null,
    created_at: "2026-09-19T00:00:00.000Z",
  },
];

const segments: TranscriptSegment[] = [
  {
    id: "t1",
    session_id: "s1",
    text: "例如抛硬币正面向上的概率是二分之一",
    start_seconds: 6,
    end_seconds: 14,
    speaker: null,
    source: "realtime",
    status: "final",
    edited: false,
    created_at: "2026-09-19T00:00:00.000Z",
  },
  {
    id: "t2",
    session_id: "s1",
    text: "作业是课本第十二页第三题",
    start_seconds: 62,
    end_seconds: 70,
    speaker: null,
    source: "realtime",
    status: "final",
    edited: false,
    created_at: "2026-09-19T00:00:00.000Z",
  },
  {
    id: "t3",
    session_id: "s1",
    text: "下节课讲条件概率，考试会考，记得预习",
    start_seconds: 70,
    end_seconds: 78,
    speaker: null,
    source: "realtime",
    status: "final",
    edited: false,
    created_at: "2026-09-19T00:00:00.000Z",
  },
];

describe("extractLocalPoints", () => {
  it("turns highlights into categorised key points", () => {
    const points = extractLocalPoints(highlights, segments);

    expect(points.some((point) => point.category === "key_point")).toBe(true);
    expect(points.some((point) => point.category === "difficult")).toBe(true);
    expect(
      points.find((point) => point.text.includes("互不相容"))?.start_seconds,
    ).toBe(320);
  });

  it("picks up homework, exam and example sentences by keyword", () => {
    const points = extractLocalPoints(highlights, segments);
    const categories = new Set(points.map((point) => point.category));

    expect(categories.has("homework")).toBe(true);
    expect(categories.has("exam")).toBe(true);
    expect(categories.has("example")).toBe(true);
  });

  it("keeps points sorted by time and de-duplicated", () => {
    const points = extractLocalPoints(highlights, segments);
    const times = points.map((point) => point.start_seconds);

    expect([...times].sort((a, b) => a - b)).toEqual(times);
    const keys = points.map((point) => `${point.category}:${point.text}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("returns an empty list when there is nothing to extract", () => {
    expect(extractLocalPoints([], [])).toEqual([]);
  });

  it("counts points per category", () => {
    const counts = countByCategory(extractLocalPoints(highlights, segments));
    expect(counts.key_point).toBeGreaterThanOrEqual(1);
    expect(counts.difficult).toBe(1);
  });
});
