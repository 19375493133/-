"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Pencil, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, formatDuration } from "@/lib/utils";
import type { TranscriptSegment } from "@/lib/types";

interface TranscriptListProps {
  segments: TranscriptSegment[];
  onSeek?: (seconds: number) => void;
  editable?: boolean;
  onEdit?: (segment: TranscriptSegment, text: string) => Promise<void> | void;
  emptyText?: string;
}

/**
 * 字幕时间轴：时间戳独立成列（等宽数字），正文各自成行，用分隔线代替每行卡片。
 * 这样 100 段字幕也是一条可扫读的时间轴，而不是 100 个带边框的盒子。
 */
export function TranscriptList({
  segments,
  onSeek,
  editable = false,
  onEdit,
  emptyText = "暂无转写内容。",
}: TranscriptListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [segments]);

  if (segments.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <div>
      <ol className="divide-y divide-border/50">
        {segments.map((segment) => {
          const isInterim = segment.status === "interim";
          return (
            <li
              key={segment.id}
              className="grid grid-cols-[3.25rem_1fr] gap-3 py-3 sm:grid-cols-[4rem_1fr] sm:gap-4"
            >
              <button
                type="button"
                className="tnum h-6 self-start rounded px-1 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                onClick={() => onSeek?.(segment.start_seconds)}
                title="跳转到对应录音位置"
              >
                {formatDuration(segment.start_seconds)}
              </button>

              <div className="min-w-0">
                {editingId === segment.id ? (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      id={`transcript-edit-${segment.id}`}
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                    />
                    <div className="flex shrink-0 gap-2">
                      <Button
                        size="sm"
                        onClick={async () => {
                          const text = draft.trim();
                          if (!text) {
                            return;
                          }
                          await onEdit?.(segment, text);
                          setEditingId(null);
                        }}
                      >
                        <Check className="mr-1 h-4 w-4" />
                        保存
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingId(null)}
                      >
                        <X className="mr-1 h-4 w-4" />
                        取消
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p
                      className={cn(
                        "whitespace-pre-wrap text-sm leading-relaxed",
                        isInterim && "italic text-muted-foreground",
                      )}
                    >
                      {segment.text}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      {segment.speaker ? <span>{segment.speaker}</span> : null}
                      {segment.source === "batch" ? (
                        <span>批处理校正</span>
                      ) : null}
                      {segment.edited ? (
                        <span className="text-sky-300">已编辑</span>
                      ) : null}
                      {editable && !isInterim ? (
                        <button
                          type="button"
                          className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          onClick={() => {
                            setEditingId(segment.id);
                            setDraft(segment.text);
                          }}
                          title="编辑这段字幕"
                          aria-label={`编辑字幕：${segment.text.slice(0, 20)}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <div ref={endRef} />
    </div>
  );
}
