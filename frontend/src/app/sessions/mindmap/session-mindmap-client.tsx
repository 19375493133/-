"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Home, Languages, RefreshCw } from "lucide-react";

import { MindMapPanel } from "@/components/mind-map";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  analyzeSession,
  ApiError,
  getWhisperApiUrl,
  getMindMapOutline,
  getSession,
  listAnalysis,
  listHighlights,
  listTranscriptSegments,
  transcribeSessionAudio,
  type AnalysisResponse,
  type MindMapOutline,
} from "@/lib/api";
import type { AnalysisPoint } from "@/lib/analysis";
import { useSessionId } from "@/lib/session-route";
import { buildMindMap, mindMapToMarkdown } from "@/lib/mind-map";
import type { Highlight, Session, TranscriptSegment } from "@/lib/types";

function MindMapView({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<Session | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [transcriptSegments, setTranscriptSegments] = useState<TranscriptSegment[]>(
    [],
  );
  const [error, setError] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [outline, setOutline] = useState<MindMapOutline | null>(null);
  const [outlineError, setOutlineError] = useState<string | null>(null);
  const [generatingOutline, setGeneratingOutline] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [analysisPoints, setAnalysisPoints] = useState<AnalysisPoint[]>([]);

  const loadOutline = useCallback(
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

  const load = useCallback(async () => {
    setError(null);
    try {
      const [sessionData, highlightData, transcriptData, storedPoints] = await Promise.all([
        getSession(sessionId),
        listHighlights(sessionId),
        listTranscriptSegments(sessionId),
        listAnalysis(sessionId),
      ]);
      setSession(sessionData);
      setHighlights(highlightData);
      setTranscriptSegments(transcriptData);
      setAnalysisPoints(storedPoints);
      await loadOutline("auto");
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setNotFound(true);
        return;
      }
      setError(err instanceof Error ? err.message : "生成思维导图失败");
    }
  }, [loadOutline, sessionId]);

  /**
   * 先提取结构化重点（open-notebook 思路），再用 markmap 出图。
   * 配置了 LLM 时由模型提取，否则用后端规则；两者都会落库，刷新后还在。
   */
  const handleExtractAndRender = useCallback(async () => {
    setGeneratingOutline(true);
    setOutlineError(null);
    try {
      const result = await analyzeSession(sessionId, "auto");
      setAnalysis(result);
      setAnalysisPoints(result.points);
      setOutline(await getMindMapOutline(sessionId, "local"));
    } catch (err) {
      setOutlineError(
        err instanceof Error ? err.message : "提取重点失败",
      );
    } finally {
      setGeneratingOutline(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleVoiceMindMap = useCallback(async () => {
    if (!session) {
      return;
    }
    setTranscribing(true);
    setProgress(null);
    setTranscribeError(null);
    try {
      const segments = await transcribeSessionAudio(
        sessionId,
        session,
        (current, total) => setProgress({ current, total }),
      );
      setTranscriptSegments(segments);
      await loadOutline("auto");
    } catch (err) {
      setTranscribeError(
        err instanceof Error ? err.message : "语音转写失败",
      );
    } finally {
      setTranscribing(false);
      setProgress(null);
    }
  }, [loadOutline, session, sessionId]);

  if (error) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-10">
        <p className="text-destructive">{error}</p>
        <div className="mt-4 flex gap-2">
          <Button asChild>
            <Link href="/">返回首页</Link>
          </Button>
          <Button variant="outline" onClick={() => void load()}>
            重试
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
        正在生成思维导图...
      </main>
    );
  }

  const fallbackMarkdown = mindMapToMarkdown(
    buildMindMap(session, highlights, transcriptSegments),
  );
  const markdown = outline?.markdown ?? fallbackMarkdown;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant="ghost" asChild>
          <Link href={`/sessions/detail/?id=${sessionId}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回详情
          </Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/">
            <Home className="mr-2 h-4 w-4" />
            返回首页
          </Link>
        </Button>
      </div>

      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-3xl font-bold">思维导图</h1>
          <p className="mt-2 text-muted-foreground">
            {session.title} · {session.course || "未填写课程"}
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          重新生成
        </Button>
        {transcriptSegments.length > 0 ? (
          <Button
            variant="outline"
            disabled={transcribing}
            onClick={() => void handleVoiceMindMap()}
          >
            <Languages className="mr-2 h-4 w-4" />
            {transcribing ? "转写中..." : "重新语音转写"}
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">课堂结构（Markdown → markmap）</CardTitle>
          <CardDescription>
            点「提取重点并出图」会分两步：后端先把课堂内容整理成结构化重点
            （重点 / 难点 / 例子 / 作业 / 考试提示 / 术语），再拼成 Markdown 交给 markmap 出图。
            配置 LLM 后由模型提取重点，没配置就用本地规则，结果都会保存下来。
            {transcriptSegments.length > 0
              ? ` 已分析 ${transcriptSegments.length} 段转写。`
              : " 还没有语音转写内容，先录音或做一次语音转写。"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <MindMapPanel
            markdown={markdown}
            source={outline?.source}
            warning={analysis?.warning ?? outline?.warning ?? outlineError}
            live={outline === null}
            segmentCount={transcriptSegments.length}
            highlightCount={highlights.length}
            generating={generatingOutline}
            generateLabel="提取重点并出图"
            filename={`${session.title || "听课会话"}-思维导图`}
            points={analysisPoints}
            onGenerate={() => void handleExtractAndRender()}
          />
          {transcriptSegments.length === 0 ? (
            <div className="space-y-4 rounded-xl border bg-background/60 p-6">
              <p className="text-sm text-muted-foreground">
                这个会话还没有语音转写。推荐回到录音页开启“实时转写”，老师说话时会边说边出文字，
                思维导图也会实时更新。也可以点击下面按钮，用 free faster-whisper 转写已有录音。
              </p>
              <Button
                disabled={transcribing || !getWhisperApiUrl()}
                onClick={() => void handleVoiceMindMap()}
              >
                <Languages className="mr-2 h-4 w-4" />
                {transcribing
                  ? progress
                    ? `语音转写中 ${progress.current}/${progress.total}`
                    : "语音转写中..."
                  : "从录音生成语音导图"}
              </Button>
              {!getWhisperApiUrl() ? (
                <p className="text-sm text-destructive">
                  未配置 Whisper 后端地址，请先设置
                  NEXT_PUBLIC_WHISPER_API_URL。
                </p>
              ) : null}
              {transcribeError ? (
                <p className="text-sm text-destructive">{transcribeError}</p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}

/**
 * 真实 id 从地址栏解析，原因见 @/lib/session-route 的注释。
 * 解析出来之前不挂载内层组件，避免用占位 id 去请求数据。
 */
export default function MindMapPage() {
  const sessionId = useSessionId();

  if (!sessionId) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-10 text-muted-foreground">
        正在生成思维导图...
      </main>
    );
  }

  return <MindMapView sessionId={sessionId} />;
}
