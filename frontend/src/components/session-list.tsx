"use client";

import Link from "next/link";
import { Mic2, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime, formatDuration } from "@/lib/utils";
import type { Session } from "@/lib/types";

interface SessionListProps {
  sessions: Session[];
  onDelete: (id: string) => void;
  deletingId: string | null;
}

export function SessionList({
  sessions,
  onDelete,
  deletingId,
}: SessionListProps) {
  if (sessions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/70 px-6 py-14 text-center">
        <p className="text-sm text-muted-foreground">
          还没有听课会话。上课或开会前先建一个，录音会按会话归档。
        </p>
        <Button asChild className="mt-5">
          <Link href="/sessions/new">
            <Plus className="mr-2 h-4 w-4" />
            新建会话
          </Link>
        </Button>
      </div>
    );
  }

  // 一行一个会话：标题、状态、元信息一列，操作按主次分级（录音主、详情次、删除图标）。
  return (
    <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card/50">
      {sessions.map((session) => (
        <li
          key={session.id}
          className="flex flex-col gap-4 p-5 transition-colors hover:bg-accent/30 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h3 className="truncate text-base font-semibold">
                {session.title}
              </h3>
              <StatusBadge status={session.status} />
            </div>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {session.course || "未填写课程"} ·{" "}
              {session.teacher || "未填写教师"}
            </p>
            <p className="tnum mt-1 text-xs text-muted-foreground">
              {session.date || "-"} · 时长 {formatDuration(session.duration)}
              <span className="hidden sm:inline">
                {" "}
                · 创建于 {formatDateTime(session.created_at)}
              </span>
            </p>
            {session.error_message ? (
              <p className="mt-1 text-xs text-destructive">
                {session.error_message}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Button asChild size="sm">
              <Link href={`/sessions/${session.id}/record`}>
                <Mic2 className="mr-1.5 h-4 w-4" />
                录音
              </Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href={`/sessions/${session.id}`}>详情</Link>
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              aria-label={`删除会话 ${session.title}`}
              disabled={deletingId === session.id}
              onClick={() => onDelete(session.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
