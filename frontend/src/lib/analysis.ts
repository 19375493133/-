import type { Highlight, TranscriptSegment } from "@/lib/types";

export type AnalysisCategory =
  | "key_point"
  | "difficult"
  | "example"
  | "homework"
  | "exam"
  | "term";

export interface AnalysisPoint {
  category: AnalysisCategory;
  text: string;
  start_seconds: number;
  source: "local" | "llm";
}

export const ANALYSIS_LABELS: Record<AnalysisCategory, string> = {
  key_point: "重点",
  difficult: "难点",
  example: "例子",
  homework: "作业",
  exam: "考试提示",
  term: "术语",
};

export const ANALYSIS_ORDER: AnalysisCategory[] = [
  "key_point",
  "difficult",
  "example",
  "homework",
  "exam",
  "term",
];

const HIGHLIGHT_TO_CATEGORY: Record<Highlight["type"], AnalysisCategory> = {
  important: "key_point",
  difficult: "difficult",
  question: "exam",
  note: "term",
};

const KEYWORD_RULES: Array<[AnalysisCategory, string[]]> = [
  ["homework", ["作业", "任务", "提交", "截止", "deadline"]],
  ["exam", ["考试", "考点", "测验", "期中", "期末", "考核", "复习", "预习"]],
  ["example", ["例如", "比如", "举个例子", "举例", "例子"]],
  ["key_point", ["定义", "定理", "公式", "性质", "结论", "叫做", "称为"]],
  ["term", ["术语", "概念", "记作", "符号"]],
];

function oneLine(text: string, limit = 120): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length <= limit ? collapsed : `${collapsed.slice(0, limit - 1)}…`;
}

/**
 * 浏览器本地的重点提取（后端不可用时的兜底）。
 * 规则与后端 `services/analysis.py` 保持一致：课堂标记 + 关键词命中。
 */
export function extractLocalPoints(
  highlights: Highlight[],
  segments: TranscriptSegment[],
  limit = 24,
): AnalysisPoint[] {
  const points: AnalysisPoint[] = [];

  for (const highlight of highlights) {
    points.push({
      category: HIGHLIGHT_TO_CATEGORY[highlight.type] ?? "key_point",
      text: oneLine(highlight.content),
      start_seconds: highlight.timestamp_seconds ?? 0,
      source: "local",
    });
  }

  // 与后端一致：一句话只归到第一个命中的分类。
  const usedSegmentIds = new Set<string>();
  for (const [category, keywords] of KEYWORD_RULES) {
    for (const segment of segments) {
      if (usedSegmentIds.has(segment.id)) {
        continue;
      }
      if (keywords.some((keyword) => segment.text.includes(keyword))) {
        usedSegmentIds.add(segment.id);
        points.push({
          category,
          text: oneLine(segment.text),
          start_seconds: segment.start_seconds ?? 0,
          source: "local",
        });
      }
    }
  }

  const seen = new Set<string>();
  const deduped = points.filter((point) => {
    const key = `${point.category}:${point.text}`;
    if (!point.text || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  deduped.sort((a, b) => a.start_seconds - b.start_seconds);
  return deduped.slice(0, limit);
}

export function countByCategory(
  points: AnalysisPoint[],
): Partial<Record<AnalysisCategory, number>> {
  const counts: Partial<Record<AnalysisCategory, number>> = {};
  for (const point of points) {
    counts[point.category] = (counts[point.category] ?? 0) + 1;
  }
  return counts;
}
