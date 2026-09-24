"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, GitBranch, Mic2 } from "lucide-react";

import { TranscriptList } from "@/components/transcript-list";
import { SessionLink } from "@/components/session-link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { HighlightListCard } from "@/components/highlight-list";
import { StatusBadge } from "@/components/status-badge";
import {
  ApiError,
  getApiBaseUrl,
  getSession,
  listHighlights,
  listTranscriptSegments,
} from "@/lib/api";
import { getLocalAudio } from "@/lib/local-audio";
import { useSessionId } from "@/lib/session-route";
import { formatDateTime, formatDuration } from "@/lib/utils";
import type { Highlight, Session, TranscriptSegment } from "@/lib/types";

function SessionDetailView({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [transcriptSegments, setTranscriptSegments] = useState<
    TranscriptSegment[]
  >([]);
  const [localAudioUrl, setLocalAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    try {
      const [sessionData, highlightData, transcriptData] = await Promise.all([
        getSession(sessionId),
        listHighlights(sessionId),
        listTranscriptSegments(sessionId),
      ]);
      setSession(sessionData);
      setHighlights(highlightData);
      setTranscriptSegments(transcriptData);
      if (sessionData.merged_audio_url?.startsWith("local-audio://")) {
        const localAudio = await getLocalAudio(sessionData.id);
        if (localAudio) {
          setLocalAudioUrl(URL.createObjectURL(localAudio.blob));
        }
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setNotFound(true);
        return;
      }
      setError(err instanceof Error ? err.message : "加载会话失败");
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (localAudioUrl) {
        URL.revokeObjectURL(localAudioUrl);
      }
    };
  }, [localAudioUrl]);

  if (error) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-10">
        <p className="text-destructive">{error}</p>
        <div className="mt-4 flex gap-2">
          <Button asChild>
            <Link href="/">返回首页</Link>
          </Button>
          <Button variant="outline" onClick={() => router.back()}>
            返回上一页
          </Button>
        </div>
      </main>
    );
  }

  if (notFound) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">找不到这个听课会话</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              该会话可能保存在 Netlify 线上浏览器中，当前本地服务无法访问线上
              localStorage 数据。请回到线上地址继续使用，或在本地新建会话。
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/sessions/new">新建本地会话</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/">返回首页</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-10 text-muted-foreground">
        加载中...
      </main>
    );
  }

  const audioSrc = session.merged_audio_url?.startsWith("local-audio://")
    ? localAudioUrl
    : session.merged_audio_url
      ? `${getApiBaseUrl()}${session.merged_audio_url}`
      : null;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Button variant="ghost" asChild className="mb-4">
        <Link href="/">
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回首页
        </Link>
      </Button>

      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{session.title}</h1>
            <StatusBadge status={session.status} />
          </div>
          <CardDescription className="mt-2">
            {session.course || "未填写课程"} · {session.teacher || "未填写教师"} ·{" "}
            {session.date || "未填写日期"}
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <SessionLink href={`/sessions/${sessionId}/mindmap`}>
              <GitBranch className="mr-2 h-4 w-4" />
              思维导图
            </SessionLink>
          </Button>
          <Button asChild>
            <SessionLink href={`/sessions/${sessionId}/record`}>
              <Mic2 className="mr-2 h-4 w-4" />
              去录音
            </SessionLink>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">基本信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <span className="text-muted-foreground">状态：</span>
              <StatusBadge status={session.status} />
            </div>
            <div>
              <span className="text-muted-foreground">录音时长：</span>
              {formatDuration(session.duration)}
            </div>
            <div>
              <span className="text-muted-foreground">转写片段：</span>
              {transcriptSegments.length}
            </div>
            <div>
              <span className="text-muted-foreground">创建时间：</span>
              {formatDateTime(session.created_at)}
            </div>
            <div>
              <span className="text-muted-foreground">更新时间：</span>
              {formatDateTime(session.updated_at)}
            </div>
            {session.error_message ? (
              <p className="text-destructive">{session.error_message}</p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">实时转写结果</CardTitle>
            <CardDescription>
              点击时间戳可跳转到录音对应位置。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {audioSrc ? (
              <audio ref={audioRef} controls src={audioSrc} className="w-full" />
            ) : (
              <p className="text-sm text-muted-foreground">
                录音尚未合并，暂时不能按时间戳跳转。
              </p>
            )}
            <TranscriptList
              segments={transcriptSegments}
              onSeek={(seconds) => {
                if (audioRef.current) {
                  audioRef.current.currentTime = seconds;
                  void audioRef.current.play();
                }
              }}
              emptyText="暂无实时转写内容。回到录音页开启实时转写后，字幕会保存在这里。"
            />
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <HighlightListCard highlights={highlights} />
      </div>
    </main>
  );
}

/**
 * 静态导出（Cloudflare Pages）时，/sessions/<id>/ 由托管平台的 rewrite 规则
 * 指向本文件对应的占位页，Next 给的参数是构建期的占位值，不能直接用。
 * 所以真实 id 从地址栏解析，解析出来之前先不挂载内层组件。
 */
export default function SessionDetailPage() {
  const sessionId = useSessionId();

  if (!sessionId) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-10 text-muted-foreground">
        加载中...
      </main>
    );
  }

  return <SessionDetailView sessionId={sessionId} />;
}
