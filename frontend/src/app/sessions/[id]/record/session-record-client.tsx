"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Home } from "lucide-react";

import { AudioRecorder } from "@/components/audio-recorder";
import { HighlightPanel } from "@/components/highlight-panel";
import { HighlightList } from "@/components/highlight-list";
import { MindMapPanel } from "@/components/mind-map";
import { TranscriptList } from "@/components/transcript-list";
import { SessionLink } from "@/components/session-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  analyzeSession,
  ApiError,
  getApiBaseUrl,
  getMindMapOutline,
  getSession,
  listAnalysis,
  listHighlights,
  listTranscriptSegments,
  updateTranscriptSegment,
  type MindMapOutline,
} from "@/lib/api";
import type { AnalysisPoint } from "@/lib/analysis";
import { getLocalAudio } from "@/lib/local-audio";
import { buildMindMap, mindMapToMarkdown } from "@/lib/mind-map";
import { useSessionId } from "@/lib/session-route";
import type { Highlight, Session, TranscriptSegment } from "@/lib/types";

function RecordView({ sessionId }: { sessionId: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [transcriptSegments, setTranscriptSegments] = useState<
    TranscriptSegment[]
  >([]);
  const [interimText, setInterimText] = useState("");
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [currentTimeSeconds, setCurrentTimeSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [outline, setOutline] = useState<MindMapOutline | null>(null);
  const [outlineError, setOutlineError] = useState<string | null>(null);
  const [generatingOutline, setGeneratingOutline] = useState(false);
  const [analysisWarning, setAnalysisWarning] = useState<string | null>(null);
  const [analysisPoints, setAnalysisPoints] = useState<AnalysisPoint[]>([]);
  const [recorderPhase, setRecorderPhase] = useState<string>("idle");

  const generateOutline = useCallback(
    async (prefer: "auto" | "local" | "llm" = "auto") => {
      setGeneratingOutline(true);
      setOutlineError(null);
      try {
        setOutline(await getMindMapOutline(sessionId, prefer));
      } catch (err) {
        setOutlineError(
          err instanceof Error ? err.message : "生成思维导图大纲失败",
        );
      } finally {
        setGeneratingOutline(false);
      }
    },
    [sessionId],
  );

  /** 先提取结构化重点，再用 markmap 出图（重点会落库，刷新后还在）。 */
  const extractAnalysis = useCallback(
    async (prefer: "auto" | "local" | "llm" = "auto") => {
      setGeneratingOutline(true);
      setOutlineError(null);
      try {
        const result = await analyzeSession(sessionId, prefer);
        setAnalysisPoints(result.points);
        setAnalysisWarning(result.warning);
        setOutline(await getMindMapOutline(sessionId, "local"));
      } catch (err) {
        setOutlineError(err instanceof Error ? err.message : "提取重点失败");
      } finally {
        setGeneratingOutline(false);
      }
    },
    [sessionId],
  );

  // 录音过程中先用本地大纲即时渲染，避免每次字幕都打后端。
  const liveMarkdown = useMemo(() => {
    if (!session) {
      return "";
    }
    return mindMapToMarkdown(buildMindMap(session, highlights, transcriptSegments));
  }, [highlights, session, transcriptSegments]);

  // 字幕区顶部的小状态提示 + 最新一句字幕
  const latestFinal =
    transcriptSegments.length > 0
      ? transcriptSegments[transcriptSegments.length - 1]
      : null;
  const liveHint =
    recorderPhase === "recording"
      ? "正在录音，字幕实时更新"
      : recorderPhase === "paused"
        ? "已暂停录音"
        : recorderPhase === "stopping" || recorderPhase === "finalizing"
          ? "正在处理音频…"
          : recorderPhase === "done"
            ? "录音已结束"
            : "等待开始";

  const loadSession = useCallback(async () => {
    try {
      const sessionData = await getSession(sessionId);
      setSession(sessionData);
      if (sessionData.merged_audio_url?.startsWith("local-audio://")) {
        const localAudio = await getLocalAudio(sessionId);
        if (localAudio) {
          setAudioSrc(URL.createObjectURL(localAudio.blob));
        }
      } else if (sessionData.merged_audio_url) {
        setAudioSrc(`${getApiBaseUrl()}${sessionData.merged_audio_url}`);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setNotFound(true);
        return;
      }
      setError(err instanceof Error ? err.message : "加载会话失败");
    }
  }, [sessionId]);

  const loadHighlights = useCallback(async () => {
    try {
      setHighlights(await listHighlights(sessionId));
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        return;
      }
      setError(err instanceof Error ? err.message : "加载标记失败");
    }
  }, [sessionId]);

  const loadTranscript = useCallback(async () => {
    try {
      setTranscriptSegments(await listTranscriptSegments(sessionId));
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        return;
      }
      setError(err instanceof Error ? err.message : "加载转写失败");
    }
  }, [sessionId]);

  useEffect(() => {
    void loadSession();
    void loadHighlights();
    void loadTranscript();
  }, [loadSession, loadHighlights, loadTranscript]);

  // 页面刷新后把已保存的重点读回来（analyze 的结果存在服务端）。
  useEffect(() => {
    void listAnalysis(sessionId)
      .then((points) => setAnalysisPoints(points))
      .catch(() => undefined);
  }, [sessionId]);

  useEffect(() => {
    return () => {
      if (audioSrc?.startsWith("blob:")) {
        URL.revokeObjectURL(audioSrc);
      }
    };
  }, [audioSrc]);

  if (notFound) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">找不到这个听课会话</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              这个会话可能创建在 Netlify 线上浏览器里，而当前打开的是本地
              127.0.0.1:3000。线上和本地的会话数据不共享，所以本地后端找不到它。
            </p>
            <p className="text-muted-foreground">
              请回到线上地址继续使用该会话，或者在本地新建一个会话。
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

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant="ghost" asChild>
          <SessionLink href={`/sessions/${sessionId}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回详情
          </SessionLink>
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/">
            <Home className="mr-2 h-4 w-4" />
            返回首页
          </Link>
        </Button>
      </div>

      <header className="mb-6">
        <h1 className="text-3xl font-bold">{session?.title || "录音"}</h1>
        <p className="mt-2 text-muted-foreground">
          {session?.course || ""} {session?.teacher || ""}
        </p>
      </header>

      {error ? <p className="mb-4 text-destructive">{error}</p> : null}

      <div className="space-y-6">
        {/* 字幕放在最上面：录音时视线不用往下找 */}
        <Card className="border-primary/40">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-xl">实时字幕</CardTitle>
              <span className="text-xs text-muted-foreground">{liveHint}</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {interimText ? (
              <p className="rounded-md bg-muted px-3 py-2 text-base italic text-muted-foreground">
                {interimText}
              </p>
            ) : null}

            {latestFinal ? (
              <p className="text-lg leading-relaxed text-foreground">
                {latestFinal.text}
              </p>
            ) : !interimText ? (
              <p className="text-sm text-muted-foreground">
                开始录音后，老师说的话会实时出现在这里。
              </p>
            ) : null}

            {transcriptSegments.length > 0 ? (
              <details className="rounded-md border bg-background/50 p-3">
                <summary className="cursor-pointer text-sm text-muted-foreground">
                  全部字幕（{transcriptSegments.length} 条，可点时间戳跳转、点铅笔改字）
                </summary>
                <div className="mt-3 max-h-72 overflow-y-auto pr-1">
                  <TranscriptList
                    segments={transcriptSegments}
                    editable
                    onSeek={(seconds) => {
                      if (audioRef.current) {
                        audioRef.current.currentTime = seconds;
                        void audioRef.current.play();
                      }
                    }}
                    onEdit={async (segment, text) => {
                      const updated = await updateTranscriptSegment(segment.id, {
                        text,
                        speaker: segment.speaker,
                      });
                      setTranscriptSegments((items) =>
                        items.map((item) =>
                          item.id === segment.id ? updated : item,
                        ),
                      );
                    }}
                  />
                </div>
              </details>
            ) : null}

            {audioSrc ? (
              <audio ref={audioRef} controls src={audioSrc} className="w-full" />
            ) : null}
          </CardContent>
        </Card>

        {session ? (
          <AudioRecorder
            sessionId={sessionId}
            onElapsedChange={setCurrentTimeSeconds}
            onInterimChange={setInterimText}
            onPhaseChange={setRecorderPhase}
            onFinalized={() => {
              void loadSession();
              void loadTranscript();
              // 录音结束后提取重点并出图（配置了 LLM 就是模型提取的结果）。
              void extractAnalysis("auto");
            }}
            onTranscriptSegment={(segment) => {
              setTranscriptSegments((items) => [...items, segment]);
            }}
            sessionStatus={session.status}
          />
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              正在加载会话...
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">实时思维导图</CardTitle>
          </CardHeader>
          <CardContent>
            {session ? (
              <MindMapPanel
                markdown={outline?.markdown ?? liveMarkdown}
                source={outline?.source}
                warning={analysisWarning ?? outline?.warning ?? outlineError}
                live={outline === null}
                segmentCount={transcriptSegments.length}
                highlightCount={highlights.length}
                generating={generatingOutline}
                generateLabel="提取重点并出图"
                filename={`${session.title || "听课会话"}-思维导图`}
                points={analysisPoints}
                onGenerate={() => void extractAnalysis("auto")}
                onSeek={(seconds) => {
                  if (audioRef.current) {
                    audioRef.current.currentTime = seconds;
                    void audioRef.current.play();
                  }
                }}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                正在加载会话...
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">录音中标记与随想随记</CardTitle>
          </CardHeader>
          <CardContent>
            <HighlightPanel
              sessionId={sessionId}
              currentTimeSeconds={currentTimeSeconds}
              highlights={highlights}
              onHighlightsChange={setHighlights}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">已保存标记</CardTitle>
          </CardHeader>
          <CardContent>
            <HighlightList highlights={highlights} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

/**
 * 真实 id 从地址栏解析，原因见 @/lib/session-route 的注释。
 * 解析出来之前不挂载内层组件，避免用占位 id 去请求数据。
 */
export default function RecordPage() {
  const sessionId = useSessionId();

  if (!sessionId) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-10 text-muted-foreground">
        正在加载会话...
      </main>
    );
  }

  return <RecordView sessionId={sessionId} />;
}
