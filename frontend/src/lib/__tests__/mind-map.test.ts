import { describe, expect, it } from "vitest";

import { buildMindMap, mindMapToMarkdown } from "@/lib/mind-map";
import type { Highlight, Session, TranscriptSegment } from "@/lib/types";

const session: Session = {
  id: "session-1",
  title: "高等数学：极限",
  course: "高等数学",
  teacher: "张老师",
  date: "2026-09-17",
  status: "done",
  duration: 90,
  error_message: null,
  merged_audio_url: null,
  created_at: "2026-09-17T00:00:00.000Z",
  updated_at: "2026-09-17T00:00:00.000Z",
};

const highlights: Highlight[] = [
  {
    id: "h1",
    session_id: session.id,
    type: "important",
    content: "极限的定义",
    timestamp_seconds: 12,
    speaker: "张老师",
    created_at: "2026-09-17T00:00:00.000Z",
  },
  {
    id: "h2",
    session_id: session.id,
    type: "note",
    content: "课后复习夹逼定理",
    timestamp_seconds: 65,
    speaker: null,
    created_at: "2026-09-17T00:00:00.000Z",
  },
];

describe("buildMindMap", () => {
  it("builds a mind map from session info and highlights", () => {
    const root = buildMindMap(session, highlights);

    expect(root.label).toBe("高等数学：极限");
    const markBranch = root.children.find((item) => item.id === "classroom-marks");
    expect(markBranch?.children.map((item) => item.label)).toContain("重点");
    expect(
      markBranch?.children
        .flatMap((item) => item.children)
        .map((item) => item.label),
    ).toContain("极限的定义");
  });

  it("shows an empty-state branch when there are no marks", () => {
    const root = buildMindMap(session, []);
    const markBranch = root.children.find((item) => item.id === "classroom-marks");
    expect(markBranch?.children[0]?.label).toBe("暂无课堂标记");
  });

  it("adds a lecture branch from transcript segments", () => {
    const transcript: TranscriptSegment[] = [
      {
        id: "t1",
        session_id: session.id,
        text: "极限的定义是当自变量趋近某个值时，函数值趋近某个确定值。",
        start_seconds: 0,
        end_seconds: 8,
        speaker: "老师",
        source: "realtime",
        status: "final",
        edited: false,
        created_at: "2026-09-17T00:00:00.000Z",
      },
      {
        id: "t2",
        session_id: session.id,
        text: "所以极限描述的是函数值的变化趋势。",
        start_seconds: 8,
        end_seconds: 14,
        speaker: "老师",
        source: "realtime",
        status: "final",
        edited: false,
        created_at: "2026-09-17T00:00:00.000Z",
      },
    ];

    const root = buildMindMap(session, highlights, transcript);
    const lecture = root.children.find((item) => item.id === "lecture-content");
    expect(lecture?.children.some((item) => item.label.includes("极限"))).toBe(true);
    expect(root.children[0]?.id).toBe("lecture-content");
  });
});

describe("mindMapToMarkdown", () => {
  it("renders a markmap-friendly markdown outline", () => {
    const markdown = mindMapToMarkdown(buildMindMap(session, highlights));

    expect(markdown.startsWith("# 高等数学：极限")).toBe(true);
    expect(markdown).toContain("## 课程信息");
    expect(markdown).toContain("- 课程：高等数学");
    expect(markdown).toContain("### 重点");
    expect(markdown).toContain("极限的定义（00:12");
    expect(markdown.endsWith("\n")).toBe(true);
  });

  it("keeps transcript sentences as list items", () => {
    const transcript: TranscriptSegment[] = [
      {
        id: "t1",
        session_id: session.id,
        text: "极限描述的是函数值的变化趋势。",
        start_seconds: 0,
        end_seconds: 6,
        speaker: null,
        source: "realtime",
        status: "final",
        edited: false,
        created_at: "2026-09-17T00:00:00.000Z",
      },
    ];

    const markdown = mindMapToMarkdown(
      buildMindMap(session, highlights, transcript),
    );
    expect(markdown).toContain("## 老师讲解");
    expect(markdown).toContain("极限描述的是函数值的变化趋势");
  });

  it("still produces a usable outline without any highlights", () => {
    const markdown = mindMapToMarkdown(buildMindMap(session, []));
    expect(markdown).toContain("# 高等数学：极限");
    expect(markdown).toContain("暂无课堂标记");
  });
});
