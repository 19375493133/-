"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Plus, Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SessionList } from "@/components/session-list";
import { deleteSession, listSessions } from "@/lib/api";
import type { Session } from "@/lib/types";

export default function HomePage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSessions(await listSessions());
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载会话失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDelete(id: string) {
    if (!window.confirm("确定删除这个听课会话吗？录音和标记也会一并删除。")) {
      return;
    }
    setDeletingId(id);
    try {
      await deleteSession(id);
      setSessions((items) => items.filter((item) => item.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除会话失败");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="relative mb-8 overflow-hidden rounded-3xl border border-white/10 bg-[url('/theme/motorcycle-hero.jpg')] bg-cover bg-center shadow-2xl shadow-sky-950/30">
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/95 via-slate-950/80 to-slate-950/15" />
        <div className="relative flex flex-col justify-between gap-6 p-8 sm:flex-row sm:items-end">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-bold text-white sm:text-4xl">
              大学课堂听课助手
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-200 sm:text-base">
              边听边转写，自动整理重点，最后生成可导出的思维导图大纲。
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button asChild variant="outline">
              <Link href="/settings">
                <Settings className="mr-2 h-4 w-4" />
                设置
              </Link>
            </Button>
            <Button asChild>
              <Link href="/sessions/new">
                <Plus className="mr-2 h-4 w-4" />
                新建会话
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {error ? (
        <div className="mb-6 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <section>
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-semibold tracking-tight">听课会话</h2>
          {!loading && sessions.length > 0 ? (
            <span className="tnum text-xs text-muted-foreground">
              {sessions.length} 个
            </span>
          ) : null}
        </div>
        {loading ? (
          <div className="space-y-3">
            {[0, 1].map((index) => (
              <div
                key={index}
                className="h-24 animate-pulse rounded-xl border border-border/60 bg-card/40"
              />
            ))}
          </div>
        ) : (
          <SessionList
            sessions={sessions}
            onDelete={handleDelete}
            deletingId={deletingId}
          />
        )}
      </section>
    </main>
  );
}
