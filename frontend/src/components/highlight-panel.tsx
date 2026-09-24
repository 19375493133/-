"use client";

import { useState } from "react";
import { BookmarkPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { addHighlight } from "@/lib/api";
import { formatDuration } from "@/lib/utils";
import type { Highlight, HighlightType } from "@/lib/types";

interface HighlightPanelProps {
  sessionId: string;
  currentTimeSeconds: number;
  highlights: Highlight[];
  onHighlightsChange: (highlights: Highlight[]) => void;
}

export function HighlightPanel({
  sessionId,
  currentTimeSeconds,
  highlights,
  onHighlightsChange,
}: HighlightPanelProps) {
  const [type, setType] = useState<HighlightType>("important");
  const [content, setContent] = useState("");
  const [speaker, setSpeaker] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    if (!content.trim()) {
      setError("请先填写标记内容");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await addHighlight(sessionId, {
        type,
        content,
        timestamp_seconds: currentTimeSeconds,
        speaker: speaker || undefined,
      });
      onHighlightsChange([...highlights, created]);
      setContent("");
      setSpeaker("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "标记保存失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
        <div className="space-y-2">
          <Label>标记类型</Label>
          <Select value={type} onValueChange={(value) => setType(value as HighlightType)}>
            <SelectTrigger>
              <SelectValue placeholder="选择类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="important">重点</SelectItem>
              <SelectItem value="difficult">难点</SelectItem>
              <SelectItem value="question">问题</SelectItem>
              <SelectItem value="note">笔记</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="highlight-speaker">说话人（可选，为声纹区分预留）</Label>
          <Input
            id="highlight-speaker"
            value={speaker}
            onChange={(event) => setSpeaker(event.target.value)}
            placeholder="例如：张老师 / 学生A"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="highlight-content">随想随记 / 标记内容</Label>
        <Textarea
          id="highlight-content"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="记录当前的重点、难点、问题或想法"
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          当前时间：{formatDuration(currentTimeSeconds)}
        </span>
        <Button type="button" onClick={handleAdd} disabled={submitting}>
          <BookmarkPlus className="mr-1 h-4 w-4" />
          {submitting ? "保存中..." : "添加标记"}
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

