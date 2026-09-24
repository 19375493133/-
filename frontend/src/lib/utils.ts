import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const parts = [minutes, seconds].map((value) => String(value).padStart(2, "0"));
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${parts.join(":")}`;
  }
  return parts.join(":");
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString("zh-CN", {
    hour12: false,
  });
}

export function highlightLabel(type: string): string {
  const labels: Record<string, string> = {
    important: "重点",
    difficult: "难点",
    question: "问题",
    note: "笔记",
  };
  return labels[type] ?? type;
}

