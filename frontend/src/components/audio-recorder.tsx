"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Mic, Pause, Play, Square } from "lucide-react";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  addTranscriptSegment,
  finalizeSession,
  listChunks,
  uploadChunk,
} from "@/lib/api";
import {
  ASR_PROVIDER_LABELS,
  createASRProvider,
  isFunASRConfigured,
  isWebSpeechProviderAvailable,
  loadASRSettings,
  saveASRSettings,
  type ASRProvider,
  type LiveTranscriptEvent,
} from "@/lib/asr";
import { clearLocalAudioChunks } from "@/lib/local-audio";
import { formatDuration } from "@/lib/utils";
import type { RecordingChunk, Session, TranscriptSegment } from "@/lib/types";

type RecorderPhase =
  | "idle"
  | "recording"
  | "paused"
  | "stopping"
  | "finalizing"
  | "done"
  | "error";

interface PendingChunk {
  blob: Blob;
  chunkId: string;
  chunkIndex: number;
  startOffsetSeconds: number;
  endOffsetSeconds: number;
}

interface AudioRecorderProps {
  sessionId: string;
  onElapsedChange?: (seconds: number) => void;
  onFinalized?: () => void;
  onTranscriptSegment?: (segment: TranscriptSegment) => void;
  onInterimChange?: (text: string) => void;
  onPhaseChange?: (phase: RecorderPhase) => void;
  sessionStatus?: Session["status"];
}

function newChunkId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

export function AudioRecorder({
  sessionId,
  onElapsedChange,
  onFinalized,
  onTranscriptSegment,
  onInterimChange,
  onPhaseChange,
  sessionStatus,
}: AudioRecorderProps) {
  const [phase, setPhase] = useState<RecorderPhase>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [waveLevel, setWaveLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [existingChunks, setExistingChunks] = useState<RecordingChunk[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [asrSettings, setAsrSettings] = useState(loadASRSettings);
  const [interimText, setInterimText] = useState("");
  const [speechError, setSpeechError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const providerRef = useRef<ASRProvider | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const chunkIndexRef = useRef(0);
  const chunkStartRef = useRef(0);
  const recordingStartRef = useRef<number | null>(null);
  const totalPausedMsRef = useRef(0);
  const pauseStartedAtRef = useRef<number | null>(null);
  const phaseRef = useRef<RecorderPhase>("idle");
  const queueRef = useRef<PendingChunk[]>([]);
  const queueActiveRef = useRef(false);
  const stopRequestedRef = useRef(false);
  const finalizingRef = useRef(false);
  const mountedRef = useRef(true);

  const updatePhase = useCallback(
    (next: RecorderPhase) => {
      phaseRef.current = next;
      setPhase(next);
      onPhaseChange?.(next);
    },
    [onPhaseChange],
  );

  const currentElapsedSeconds = useCallback((): number => {
    if (recordingStartRef.current === null) {
      return 0;
    }
    let paused = totalPausedMsRef.current;
    if (pauseStartedAtRef.current !== null) {
      paused += performance.now() - pauseStartedAtRef.current;
    }
    return Math.max(
      0,
      (performance.now() - recordingStartRef.current - paused) / 1000,
    );
  }, []);

  const cleanupMedia = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      void audioContextRef.current.close();
    }
    audioContextRef.current = null;
    analyserRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    streamRef.current = null;
    providerRef.current?.stop();
    providerRef.current = null;
    mediaRecorderRef.current = null;
  }, []);

  const uploadWithRetry = useCallback(
    async (chunk: PendingChunk): Promise<void> => {
      setUploadingCount((count) => count + 1);
      try {
        let lastError: unknown;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            await uploadChunk(sessionId, {
              chunkId: chunk.chunkId,
              chunkIndex: chunk.chunkIndex,
              startOffsetSeconds: chunk.startOffsetSeconds,
              endOffsetSeconds: chunk.endOffsetSeconds,
              blob: chunk.blob,
            });
            return;
          } catch (err) {
            lastError = err;
            if (attempt < 2) {
              await delay(1000 * (attempt + 1));
            }
          }
        }
        throw lastError instanceof Error ? lastError : new Error("分片上传失败");
      } finally {
        setUploadingCount((count) => Math.max(0, count - 1));
      }
    },
    [sessionId],
  );

  const finishSession = useCallback(async () => {
    if (finalizingRef.current) {
      return;
    }
    finalizingRef.current = true;
    updatePhase("finalizing");
    setError(null);
    try {
      await finalizeSession(sessionId, asrSettings.realtimeEnabled);
      updatePhase("done");
      cleanupMedia();
      onFinalized?.();
    } catch (err) {
      updatePhase("error");
      setError(err instanceof Error ? err.message : "合并音频失败");
    } finally {
      finalizingRef.current = false;
    }
  }, [
    asrSettings.realtimeEnabled,
    cleanupMedia,
    onFinalized,
    sessionId,
    updatePhase,
  ]);

  const processQueue = useCallback(async () => {
    if (queueActiveRef.current) {
      return;
    }
    queueActiveRef.current = true;
    try {
      while (queueRef.current.length > 0) {
        const chunk = queueRef.current.shift();
        if (!chunk) {
          continue;
        }
        try {
          await uploadWithRetry(chunk);
        } catch (err) {
          stopRequestedRef.current = false;
          updatePhase("error");
          setError(err instanceof Error ? err.message : "分片上传失败");
          return;
        }
      }
    } finally {
      queueActiveRef.current = false;
      if (stopRequestedRef.current && queueRef.current.length === 0) {
        stopRequestedRef.current = false;
        await finishSession();
      }
    }
  }, [finishSession, updatePhase, uploadWithRetry]);

  const handleDataAvailable = useCallback(
    (event: BlobEvent) => {
      if (!event.data || event.data.size === 0) {
        return;
      }
      const end = Math.max(
        currentElapsedSeconds(),
        chunkStartRef.current + 0.001,
      );
      const chunk: PendingChunk = {
        blob: event.data,
        chunkId: newChunkId(),
        chunkIndex: chunkIndexRef.current,
        startOffsetSeconds: chunkStartRef.current,
        endOffsetSeconds: end,
      };
      providerRef.current?.pushAudioChunk?.(
        event.data,
        chunkIndexRef.current === 0,
      );
      chunkIndexRef.current += 1;
      chunkStartRef.current = end;
      queueRef.current.push(chunk);
      void processQueue();
    },
    [currentElapsedSeconds, processQueue],
  );

  const startWaveformLoop = useCallback(() => {
    const draw = () => {
      if (!mountedRef.current) {
        return;
      }
      const analyser = analyserRef.current;
      if (!analyser) {
        animationFrameRef.current = requestAnimationFrame(draw);
        return;
      }
      const data = new Uint8Array(analyser.fftSize || 256);
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const value of data) {
        const normalized = (value - 128) / 128;
        sum += normalized * normalized;
      }
      const level = Math.min(100, Math.round(Math.sqrt(sum / data.length) * 180));
      setWaveLevel(level);
      animationFrameRef.current = requestAnimationFrame(draw);
    };
    draw();
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let active = true;
    void listChunks(sessionId)
      .then((chunks) => {
        if (active) {
          setExistingChunks(chunks);
        }
      })
      .catch(() => {
        if (active) {
          setError("无法读取已有分片，请确认后端已启动。");
        }
      });
    return () => {
      active = false;
      mountedRef.current = false;
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [sessionId]);

  useEffect(() => {
    saveASRSettings(asrSettings);
  }, [asrSettings]);

  useEffect(() => {
    if (phase !== "recording") {
      return;
    }
    const timer = window.setInterval(() => {
      setElapsedSeconds(currentElapsedSeconds());
    }, 250);
    startWaveformLoop();
    return () => {
      window.clearInterval(timer);
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      setWaveLevel(0);
    };
  }, [currentElapsedSeconds, phase, startWaveformLoop]);

  useEffect(() => {
    onElapsedChange?.(elapsedSeconds);
  }, [elapsedSeconds, onElapsedChange]);

  async function startRecording() {
    setError(null);
    updatePhase("idle");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("当前浏览器不支持 MediaDevices，请使用最新版 Chrome/Edge。");
      return;
    }
    if (existingChunks.length > 0) {
      if (sessionStatus === "done") {
        await clearLocalAudioChunks(sessionId);
        setExistingChunks([]);
      } else {
        setError(
          "该会话已有音频分片。当前版本不支持重载后继续原录音，请到详情页合并已有分片。",
        );
        return;
      }
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        // 课堂语音转写不需要高码率，48kbps 能显著缩小长时间录音体积。
        audioBitsPerSecond: 48000,
      });

      const AudioContextClass =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const audioContext = new AudioContextClass();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      await audioContext.resume();

      streamRef.current = stream;
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      mediaRecorderRef.current = recorder;
      chunkIndexRef.current = 0;
      chunkStartRef.current = 0;
      recordingStartRef.current = performance.now();
      totalPausedMsRef.current = 0;
      pauseStartedAtRef.current = null;
      queueRef.current = [];
      queueActiveRef.current = false;
      stopRequestedRef.current = false;
      finalizingRef.current = false;

      recorder.ondataavailable = handleDataAvailable;
      recorder.onerror = () => {
        updatePhase("error");
        setError("浏览器录音发生错误，请重试。");
      };
      recorder.onstop = () => {
        stopRequestedRef.current = true;
        if (!queueActiveRef.current) {
          void processQueue();
        }
      };

      recorder.start(asrSettings.provider === "backend_ws" ? 1_500 : 30_000);
      updatePhase("recording");
      setElapsedSeconds(0);
      setSpeechError(null);
      setInterimText("");
      onInterimChange?.("");
      if (asrSettings.realtimeEnabled) {
        const provider = createASRProvider(asrSettings, {
          sessionId,
          language: asrSettings.language,
          getElapsedSeconds: currentElapsedSeconds,
          onInterim: (event: LiveTranscriptEvent) => {
            setInterimText(event.text);
            onInterimChange?.(event.text);
          },
          onFinal: async (event: LiveTranscriptEvent) => {
            setInterimText("");
            onInterimChange?.("");
            if (event.isMock) {
              setSpeechError(
                "当前使用 MockProvider，显示的是模拟字幕，不会写入正式转写结果。",
              );
              return;
            }
            try {
              const segment = await addTranscriptSegment(sessionId, {
                text: event.text,
                startSeconds: event.startMs / 1000,
                endSeconds: event.endMs / 1000,
                speaker: event.speaker ?? undefined,
                source: "realtime",
              });
              onTranscriptSegment?.(segment);
            } catch (err) {
              setSpeechError(
                err instanceof Error ? err.message : "字幕保存失败",
              );
            }
          },
          onError: setSpeechError,
        });
        providerRef.current = provider;
        void provider.start(stream);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法访问麦克风");
      cleanupMedia();
      // 启动失败时回到 idle，按钮保持可点，用户可以直接重试。
      updatePhase("idle");
    }
  }

  function pauseRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "recording") {
      return;
    }
    recorder.pause();
    providerRef.current?.pause();
    pauseStartedAtRef.current = performance.now();
    updatePhase("paused");
  }

  function resumeRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "paused") {
      return;
    }
    if (pauseStartedAtRef.current !== null) {
      totalPausedMsRef.current += performance.now() - pauseStartedAtRef.current;
      pauseStartedAtRef.current = null;
    }
    recorder.resume();
    providerRef.current?.resume();
    updatePhase("recording");
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      return;
    }
    if (recorder.state === "paused") {
      if (pauseStartedAtRef.current !== null) {
        totalPausedMsRef.current += performance.now() - pauseStartedAtRef.current;
        pauseStartedAtRef.current = null;
      }
      recorder.resume();
    }
    updatePhase("stopping");
    providerRef.current?.stop();
    providerRef.current = null;
    setInterimText("");
    onInterimChange?.("");
    recorder.stop();
  }

  const waveformBars = Array.from({ length: 24 }, (_, index) => {
    const active = waveLevel > index * 4;
    const height = active ? 8 + Math.min(24, waveLevel / 4) : 4;
    return (
      <span
        key={index}
        className="w-1 rounded-full bg-primary transition-all"
        style={{ height: `${height}px` }}
      />
    );
  });

  return (
    <div className="space-y-5">
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>录音前提示</AlertTitle>
        <AlertDescription>
          请遵守当地法律和课堂规定，必要时征得老师同意。录音数据默认保存在本地。
        </AlertDescription>
      </Alert>

      <div className="rounded-lg border bg-card/70 p-4">
        <div className="flex items-start justify-between gap-3">
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-sky-500"
              checked={asrSettings.realtimeEnabled}
              disabled={phase !== "idle"}
              onChange={(event) =>
                setAsrSettings((current) => ({
                  ...current,
                  realtimeEnabled: event.target.checked,
                }))
              }
            />
            <span>
              <span className="font-medium">实时语音转文字</span>
              <span className="mt-1 block text-muted-foreground">
                Provider：{ASR_PROVIDER_LABELS[asrSettings.provider]} · 语言：
                {asrSettings.language === "zh" ? "中文" : "English"}
              </span>
              {asrSettings.provider === "funasr" && !isFunASRConfigured() ? (
                <span className="mt-1 block text-destructive">
                  未配置 NEXT_PUBLIC_FUNASR_API_URL，FunASR 实时转写不可用。
                  录音和分片上传仍会正常继续。
                </span>
              ) : null}
              {asrSettings.provider === "webspeech" &&
              !isWebSpeechProviderAvailable() ? (
                <span className="mt-1 block text-destructive">
                  浏览器不支持 Web Speech，请在设置中切换到 backend_ws。
                </span>
              ) : null}
              {asrSettings.provider === "mock" ? (
                <span className="mt-1 block text-amber-300">
                  MockProvider 是模拟字幕，不是真实转写。
                </span>
              ) : null}
              {asrSettings.provider === "backend_ws" ? (
                <span className="mt-1 block text-muted-foreground">
                  使用后端 Whisper 流式 Provider，音频会发送到转写服务。
                </span>
              ) : null}
            </span>
          </label>
          <Button asChild variant="ghost" size="sm">
            <Link href="/settings">设置</Link>
          </Button>
        </div>
        {speechError ? (
          <p className="mt-3 text-sm text-destructive">{speechError}</p>
        ) : null}
        {interimText ? (
          <p className="mt-3 rounded-md bg-muted p-2 text-sm text-muted-foreground">
            {interimText}
          </p>
        ) : null}
      </div>

      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <div className="flex flex-col items-center gap-6">
          <div className="text-center">
            <div className="text-4xl font-bold tabular-nums">
              {formatDuration(elapsedSeconds)}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {phase === "recording"
                ? "录音中，每 30 秒上传一个分片"
                : phase === "paused"
                  ? "已暂停 · 可以继续录音，也可以结束录音"
                  : phase === "finalizing"
                    ? "正在合并音频..."
                    : phase === "done"
                      ? "录音已合并完成"
                      : phase === "stopping"
                        ? "正在停止并上传剩余分片..."
                        : "准备开始"}
            </div>
          </div>

          <div className="flex h-10 items-end gap-1" aria-label="音量波形">
            {waveformBars}
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            {phase === "idle" || phase === "error" ? (
              <>
                <Button onClick={startRecording} disabled={existingChunks.length > 0}>
                  <Mic className="mr-2 h-4 w-4" />
                  开始录音
                </Button>
                <p className="w-full text-center text-xs text-muted-foreground">
                  开始后可以随时「暂停」，暂停后可以「继续录音」或直接「结束录音」。
                </p>
              </>
            ) : null}
            {phase === "recording" ? (
              <>
                <Button variant="outline" onClick={pauseRecording}>
                  <Pause className="mr-2 h-4 w-4" />
                  暂停录音
                </Button>
                <Button variant="destructive" onClick={stopRecording}>
                  <Square className="mr-2 h-4 w-4" />
                  结束录音
                </Button>
              </>
            ) : null}
            {phase === "paused" ? (
              <>
                <Button onClick={resumeRecording}>
                  <Play className="mr-2 h-4 w-4" />
                  继续录音
                </Button>
                <Button variant="destructive" onClick={stopRecording}>
                  <Square className="mr-2 h-4 w-4" />
                  结束录音
                </Button>
              </>
            ) : null}
          </div>

          {uploadingCount > 0 ? (
            <p className="text-sm text-muted-foreground">
              正在上传分片（当前 {uploadingCount} 个）...
            </p>
          ) : null}
          {phase === "done" ? (
            <p className="text-sm text-muted-foreground">
              音频已保存，可返回详情页下载。
            </p>
          ) : null}
          {error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>录音失败</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>
      </div>
    </div>
  );
}
