"use client";

import { Sparkles } from "lucide-react";

import { MarkmapView } from "@/components/markmap-view";
import { Button } from "@/components/ui/button";
import {
  ANALYSIS_LABELS,
  ANALYSIS_ORDER,
  countByCategory,
  type AnalysisPoint,
} from "@/lib/analysis";
import { formatDuration } from "@/lib/utils";

interface MindMapPanelProps {
  /** markmap 直接渲染的 Markdown 大纲。 */
  markdown: string;
  /** `llm` 表示这份 Markdown 由模型生成，`local` 表示本地规则化整理。 */
  source?: "local" | "llm";
  warning?: string | null;
  live?: boolean;
  segmentCount?: number;
  highlightCount?: number;
  onGenerate?: () => void;
  generating?: boolean;
  generateLabel?: string;
  filename?: string;
  /** 结构化重点（open-notebook 那种先出重点的思路）。 */
  points?: AnalysisPoint[];
  onSeek?: (seconds: number) => void;
}

export function MindMapPanel({
  markdown,
  source,
  warning,
  live = false,
  segmentCount,
  highlightCount,
  onGenerate,
  generating = false,
  generateLabel = "提取重点并出图",
  filename = "mindmap",
  points = [],
  onSeek,
}: MindMapPanelProps) {
  const badgeLabel = live
    ? "实时本地大纲"
    : source === "llm"
      ? "模型生成大纲"
      : "本地大纲";
  const badgeClass = live
    ? "bg-sky-400/10 text-sky-300"
    : source === "llm"
      ? "bg-emerald-400/10 text-emerald-300"
      : "bg-muted text-muted-foreground";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className={`rounded-full px-2 py-0.5 ${badgeClass}`}>
            {badgeLabel}
          </span>
          <span>Markdown 大纲 · markmap 渲染</span>
          {typeof segmentCount === "number" ? (
            <span>转写 {segmentCount} 段</span>
          ) : null}
          {typeof highlightCount === "number" ? (
            <span>标记 {highlightCount} 条</span>
          ) : null}
          {points.length > 0 ? <span>重点 {points.length} 条</span> : null}
        </div>
        {onGenerate ? (
          <Button
            size="sm"
            variant="outline"
            disabled={generating}
            onClick={onGenerate}
          >
            <Sparkles className="mr-1 h-3.5 w-3.5" />
            {generating ? "生成中..." : generateLabel}
          </Button>
        ) : null}
      </div>

      {warning ? (
        <p className="rounded-md bg-amber-400/10 px-3 py-2 text-xs text-amber-300">
          {warning}
        </p>
      ) : null}

      {points.length > 0 ? (
        <KeyPointList points={points} onSeek={onSeek} />
      ) : null}

      <MarkmapView markdown={markdown} filename={filename} />

      <details className="rounded-md border bg-background/60 p-3 text-xs">
        <summary className="cursor-pointer text-muted-foreground">
          查看 / 复制 Markdown 大纲
        </summary>
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted-foreground">
          {markdown}
        </pre>
      </details>
    </div>
  );
}

function KeyPointList({
  points,
  onSeek,
}: {
  points: AnalysisPoint[];
  onSeek?: (seconds: number) => void;
}) {
  const counts = countByCategory(points);
  const preview = points.slice(0, 6);

  const renderItems = (items: AnalysisPoint[]) => (
    <ul className="space-y-1">
      {items.map((point, index) => (
        <li key={`${point.category}-${index}-${point.text}`} className="flex gap-2 text-sm">
          <button
            type="button"
            className="shrink-0 rounded px-1.5 py-0.5 font-mono text-xs text-muted-foreground hover:bg-muted"
            onClick={() => onSeek?.(point.start_seconds)}
            title="跳转到对应录音位置"
          >
            {formatDuration(point.start_seconds)}
          </button>
          <span className="text-muted-foreground">
            <span className="text-foreground">
              {ANALYSIS_LABELS[point.category]}
            </span>
            {" · "}
            {point.text}
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-2 rounded-lg border bg-background/60 p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-medium text-foreground">提取到的重点</span>
        {ANALYSIS_ORDER.filter((category) => counts[category]).map((category) => (
          <span key={category} className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
            {ANALYSIS_LABELS[category]} {counts[category]}
          </span>
        ))}
      </div>

      {renderItems(preview)}

      {points.length > preview.length ? (
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">
            展开全部 {points.length} 条重点
          </summary>
          <div className="mt-2">{renderItems(points)}</div>
        </details>
      ) : null}
    </div>
  );
}
