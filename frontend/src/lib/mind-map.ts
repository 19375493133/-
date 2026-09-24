import type {
  Highlight,
  HighlightType,
  Session,
  TranscriptSegment,
} from "@/lib/types";
import { formatDuration } from "@/lib/utils";

export type MindMapTone = "primary" | "destructive" | "accent" | "muted";

export interface MindMapNodeData {
  id: string;
  label: string;
  detail?: string;
  tone?: MindMapTone;
  children: MindMapNodeData[];
}

const statusLabels: Record<Session["status"], string> = {
  created: "已创建",
  recording: "录音中",
  uploading: "上传中",
  transcribing: "转写中",
  analyzing: "分析中",
  done: "已完成",
  failed: "失败",
  pending_batch_transcribe: "待批处理转写",
};

const highlightGroups: Array<{
  type: HighlightType;
  label: string;
  tone: MindMapTone;
}> = [
  { type: "important", label: "重点", tone: "primary" },
  { type: "difficult", label: "难点", tone: "destructive" },
  { type: "question", label: "问题", tone: "accent" },
  { type: "note", label: "笔记", tone: "muted" },
];

const stopwords = new Set([
  "的",
  "的是",
  "了",
  "是",
  "在",
  "我",
  "你",
  "他",
  "她",
  "我们",
  "你们",
  "他们",
  "这个",
  "那个",
  "然后",
  "就是",
  "可以",
  "因为",
  "所以",
  "如果",
  "但是",
  "一个",
  "进行",
  "需要",
  "大家",
  "同学",
  "老师",
  "今天",
  "那么",
  "现在",
  "知道",
  "看到",
  "什么",
  "怎么",
  "这里",
  "这样",
  "时候",
  "问题",
  "内容",
  "一下",
  "有没有",
  "是不是",
  "对吧",
  "嗯",
  "啊",
  "哦",
]);

function segmentWords(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter("zh-CN", { granularity: "word" });
    return Array.from(segmenter.segment(text))
      .filter((item) => item.isWordLike)
      .map((item) => item.segment);
  }
  return text.split(/[^\p{Script=Han}A-Za-z0-9]+/u).filter(Boolean);
}

function splitSentences(text: string): string[] {
  return text
    .split(/[。！？!?；;\n]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
}

export function extractTranscriptTopics(
  segments: TranscriptSegment[],
  limit = 8,
): MindMapNodeData[] {
  const sentences = segments.flatMap((segment) =>
    splitSentences(segment.text).map((text) => ({
      text,
      startSeconds: segment.start_seconds,
    })),
  );
  if (sentences.length === 0) {
    return [];
  }

  const counts = new Map<string, number>();
  for (const sentence of sentences) {
    for (const rawWord of segmentWords(sentence.text)) {
      const word = rawWord.trim();
      if (word.length < 2 || stopwords.has(word) || /^\d+$/.test(word)) {
        continue;
      }
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }

  const sortedWords = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const frequentWords = sortedWords
    .filter(([, count]) => count >= 2)
    .map(([word]) => word);
  const keywords = (
    frequentWords.length >= 2 ? frequentWords : sortedWords.map(([word]) => word)
  ).slice(0, limit);

  if (keywords.length === 0) {
    return sentences.slice(0, limit).map((sentence, index) => ({
      id: `lecture-sentence-${index}`,
      label: sentence.text,
      detail: formatDuration(sentence.startSeconds),
      tone: "accent",
      children: [],
    }));
  }

  return keywords.map((keyword) => ({
    id: `topic-${keyword}`,
    label: keyword,
    tone: "primary",
    children: sentences
      .filter((sentence) => sentence.text.includes(keyword))
      .slice(0, 3)
      .map((sentence, index) => ({
        id: `topic-${keyword}-sentence-${index}`,
        label: sentence.text,
        detail: formatDuration(sentence.startSeconds),
        tone: "accent",
        children: [],
      })),
  }));
}

export function buildMindMap(
  session: Session,
  highlights: Highlight[],
  transcriptSegments: TranscriptSegment[] = [],
): MindMapNodeData {
  const children: MindMapNodeData[] = [
    {
      id: "session-info",
      label: "课程信息",
      tone: "accent",
      children: [
        {
          id: "course",
          label: session.course || "未填写课程",
          detail: "课程",
          children: [],
        },
        {
          id: "teacher",
          label: session.teacher || "未填写教师",
          detail: "教师",
          children: [],
        },
        {
          id: "date",
          label: session.date || "未填写日期",
          detail: "日期",
          children: [],
        },
      ],
    },
    {
      id: "recording",
      label: "录音状态",
      tone: "accent",
      children: [
        {
          id: "status",
          label: statusLabels[session.status],
          detail: "当前状态",
          children: [],
        },
        {
          id: "duration",
          label: formatDuration(session.duration),
          detail: "录音时长",
          children: [],
        },
      ],
    },
  ];

  const markChildren: MindMapNodeData[] = highlightGroups.flatMap((group) => {
      const items = highlights
        .filter((highlight) => highlight.type === group.type)
        .map<MindMapNodeData>((highlight) => ({
          id: highlight.id,
          label: highlight.content,
          detail: `${formatDuration(highlight.timestamp_seconds)}${
            highlight.speaker ? ` · ${highlight.speaker}` : ""
          }`,
          tone: group.tone,
          children: [],
        }));
      if (items.length === 0) {
        return [];
      }
      return [
        {
          id: `group-${group.type}`,
          label: group.label,
          tone: group.tone,
          children: items,
        },
      ];
    });

  children.push({
    id: "classroom-marks",
    label: "课堂标记",
    tone: "primary",
    children:
      markChildren.length > 0
        ? markChildren
        : [
            {
              id: "no-marks",
              label: "暂无课堂标记",
              detail: "录音过程中可添加重点、难点、问题或笔记",
              tone: "muted",
              children: [],
            },
          ],
          });

  const lectureTopics = extractTranscriptTopics(transcriptSegments);
  if (lectureTopics.length > 0) {
    children.unshift({
      id: "lecture-content",
      label: "老师讲解",
      tone: "primary",
      children: lectureTopics,
    });
  }

  return {
    id: "root",
    label: session.title || "听课会话",
    detail: session.course || undefined,
    tone: "primary",
    children,
  };
}

const TIMESTAMP_PATTERN = /^\d{1,2}:\d{2}(:\d{2})?/;

/**
 * 把导图树转成 Markdown 大纲，交给 markmap 渲染。
 *
 * 主要路径是后端直接返回 Markdown（`/api/sessions/{id}/mindmap`）；
 * 这个函数用于离线 / 后端不可用时的本地兜底。
 */
export function mindMapToMarkdown(root: MindMapNodeData): string {
  const lines: string[] = [];

  const pushNode = (node: MindMapNodeData, depth: number): void => {
    const label = node.label.trim();
    const detail = node.detail?.trim();
    const hasChildren = node.children.length > 0;
    const indent = "  ".repeat(Math.max(0, depth - 3));
    // 课程信息这类节点：label 是值、detail 是字段名（课程/教师/日期）。
    const isFieldValue =
      Boolean(detail) &&
      !hasChildren &&
      !TIMESTAMP_PATTERN.test(detail as string) &&
      (detail as string).length <= 8;

    if (depth <= 2 && (hasChildren || !isFieldValue)) {
      lines.push(`${"#".repeat(depth + 1)} ${label}`);
      if (detail) {
        lines.push(`- ${detail}`);
      }
    } else if (isFieldValue) {
      lines.push(`${indent}- ${detail}：${label}`);
    } else if (!detail) {
      lines.push(`${indent}- ${label}`);
    } else if (TIMESTAMP_PATTERN.test(detail)) {
      lines.push(`${indent}- ${label}（${detail}）`);
    } else {
      lines.push(`${indent}- ${label}（${detail}）`);
    }

    for (const child of node.children) {
      pushNode(child, depth + 1);
    }
  };

  pushNode(root, 0);
  lines.push("");
  return lines.join("\n");
}
