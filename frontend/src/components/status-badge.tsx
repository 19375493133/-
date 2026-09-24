import { Badge } from "@/components/ui/badge";
import type { SessionStatus } from "@/lib/types";

const labels: Record<SessionStatus, string> = {
  created: "已创建",
  recording: "录音中",
  uploading: "上传中",
  transcribing: "转写中",
  analyzing: "分析中",
  done: "已完成",
  failed: "失败",
  pending_batch_transcribe: "待批处理转写",
};

const variants: Record<SessionStatus, "default" | "secondary" | "destructive" | "outline"> = {
  created: "secondary",
  recording: "default",
  uploading: "outline",
  transcribing: "outline",
  analyzing: "outline",
  done: "secondary",
  failed: "destructive",
  pending_batch_transcribe: "outline",
};

export function StatusBadge({ status }: { status: SessionStatus }) {
  return <Badge variant={variants[status]}>{labels[status]}</Badge>;
}
