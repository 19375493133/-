import {
  SpeechTranscriber,
  isSpeechRecognitionSupported,
} from "@/lib/speech-recognition";
import type { ASRProviderName, ASRSettings } from "@/lib/types";

const SETTINGS_KEY = "classroom-listener.asr-settings.v2";
const LEGACY_SETTINGS_KEY = "classroom-listener.asr-settings.v1";
const PROVIDER_NAMES: ASRProviderName[] = [
  "funasr",
  "webspeech",
  "backend_ws",
  "mock",
];

export interface LiveTranscriptEvent {
  type: "interim" | "final" | "error";
  text: string;
  startMs: number;
  endMs: number;
  speaker?: string | null;
  isMock?: boolean;
  message?: string;
}

export interface ASRProvider {
  start(stream?: MediaStream): void | Promise<void>;
  stop(): void;
  pause(): void;
  resume(): void;
  pushAudioChunk?(blob: Blob, isFirst: boolean): void;
}

export const ASR_PROVIDER_LABELS: Record<ASRProviderName, string> = {
  funasr: "FunASR Paraformer（普通话流式）",
  webspeech: "浏览器内置语音识别（Web Speech）",
  backend_ws: "后端 Whisper 流式",
  mock: "Mock 演示字幕",
};

export interface ASRProviderOptions {
  sessionId: string;
  language: "zh" | "en";
  getElapsedSeconds: () => number;
  onInterim: (event: LiveTranscriptEvent) => void;
  onFinal: (event: LiveTranscriptEvent) => void;
  onError: (message: string) => void;
}

function defaultProvider(): ASRProviderName {
  if (process.env.NEXT_PUBLIC_FUNASR_API_URL) {
    return "funasr";
  }
  if (process.env.NEXT_PUBLIC_WHISPER_API_URL) {
    return "backend_ws";
  }
  return isSpeechRecognitionSupported() ? "webspeech" : "mock";
}

export function isFunASRConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_FUNASR_API_URL);
}

function defaultSettings(): ASRSettings {
  return {
    realtimeEnabled: true,
    provider: defaultProvider(),
    language: "zh",
  };
}

function normalizeSettings(raw: unknown): ASRSettings | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const candidate = raw as Partial<ASRSettings>;
  if (!candidate.provider || !PROVIDER_NAMES.includes(candidate.provider)) {
    return null;
  }
  return {
    realtimeEnabled: true,
    provider: candidate.provider,
    language: candidate.language === "en" ? "en" : "zh",
  };
}

/**
 * v1 里用户可能选过 `backend_ws`（免费 Whisper 流式）。
 * 现在有 FunASR 时自动升级到 FunASR，否则老设置会把推荐 Provider 挡住。
 */
export function migrateLegacySettings(legacy: ASRSettings): ASRSettings {
  const provider =
    legacy.provider === "backend_ws" && isFunASRConfigured()
      ? "funasr"
      : legacy.provider;
  return {
    realtimeEnabled: true,
    provider,
    language: legacy.language === "en" ? "en" : "zh",
  };
}

export function loadASRSettings(): ASRSettings {
  if (typeof window === "undefined") {
    return defaultSettings();
  }
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const stored = normalizeSettings(JSON.parse(raw));
      if (stored) {
        return stored;
      }
    }
    const legacyRaw = window.localStorage.getItem(LEGACY_SETTINGS_KEY);
    if (legacyRaw) {
      const legacy = normalizeSettings(JSON.parse(legacyRaw));
      if (legacy) {
        const migrated = migrateLegacySettings(legacy);
        saveASRSettings(migrated);
        return migrated;
      }
    }
  } catch {
    // 本地存储损坏时回落到默认值。
  }
  return defaultSettings();
}

export function saveASRSettings(settings: ASRSettings): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function isWebSpeechProviderAvailable(): boolean {
  return isSpeechRecognitionSupported();
}

class BrowserWebSpeechProvider implements ASRProvider {
  private transcriber: SpeechTranscriber | null = null;

  constructor(private readonly options: ASRProviderOptions) {}

  start(): void {
    if (!isSpeechRecognitionSupported()) {
      this.options.onError(
        "浏览器内置实时语音识别不可用，请在设置中切换到 backend_ws 或 mock。",
      );
      return;
    }
    this.transcriber = new SpeechTranscriber({
      sessionId: this.options.sessionId,
      getElapsedSeconds: this.options.getElapsedSeconds,
      onInterim: (text) =>
        this.options.onInterim({
          type: "interim",
          text,
          startMs: Math.round(this.options.getElapsedSeconds() * 1000),
          endMs: Math.round(this.options.getElapsedSeconds() * 1000),
        }),
      onFinal: (payload) =>
        this.options.onFinal({
          type: "final",
          text: payload.text,
          startMs: Math.round(payload.startSeconds * 1000),
          endMs: Math.round(payload.endSeconds * 1000),
          speaker: payload.speaker ?? "老师",
        }),
      onError: this.options.onError,
    });
    this.transcriber.start();
  }

  stop(): void {
    this.transcriber?.stop();
    this.transcriber = null;
  }

  pause(): void {
    this.transcriber?.pause();
  }

  resume(): void {
    this.transcriber?.resume();
  }
}

class MockProvider implements ASRProvider {
  private timer: number | null = null;
  private index = 0;

  constructor(private readonly options: ASRProviderOptions) {}

  start(): void {
    this.options.onError(
      "当前使用 MockProvider，显示的是模拟字幕，不是真实课堂转写。",
    );
    this.timer = window.setInterval(() => {
      this.index += 1;
      const startMs = (this.index - 1) * 1200;
      const endMs = this.index * 1200;
      this.options.onInterim({
        type: "interim",
        text: `[MOCK] 模拟临时字幕 ${this.index}`,
        startMs,
        endMs,
        isMock: true,
      });
      if (this.index % 3 === 0) {
        this.options.onFinal({
          type: "final",
          text: `[MOCK] 模拟字幕片段 ${this.index - 2}-${this.index}`,
          startMs: Math.max(0, (this.index - 3) * 1200),
          endMs,
          isMock: true,
        });
      }
    }, 1200);
  }

  stop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  pause(): void {
    this.stop();
  }

  resume(): void {
    if (this.timer === null) {
      this.start();
    }
  }
}

function whisperWebSocketUrl(sessionId: string, language: string): string | null {
  const base = process.env.NEXT_PUBLIC_WHISPER_API_URL;
  if (!base) {
    return null;
  }
  const wsBase = base.replace(/^http/, "ws").replace(/\/$/, "");
  return `${wsBase}/ws/sessions/${sessionId}/live-transcribe?provider=backend_ws&language=${encodeURIComponent(language)}`;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

class WhisperBackendProvider implements ASRProvider {
  private websocket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private active = false;
  private paused = false;
  private buffer: Array<{ blob: Blob; isFirst: boolean }> = [];

  constructor(private readonly options: ASRProviderOptions) {}

  start(): void {
    this.active = true;
    this.paused = false;
    this.connect();
  }

  stop(): void {
    this.active = false;
    this.paused = false;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.sendEndAndClose();
    this.buffer = [];
  }

  pause(): void {
    this.paused = true;
    this.sendEndAndClose();
  }

  resume(): void {
    this.paused = false;
    if (this.active && !this.websocket) {
      this.connect();
    }
  }

  pushAudioChunk(blob: Blob, isFirst: boolean): void {
    if (!this.active || this.paused) {
      return;
    }
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      // 断线时缓冲最近 5-10 秒音频，重连后续传。
      this.buffer.push({ blob, isFirst });
      if (this.buffer.length > 6) {
        this.buffer.shift();
      }
      return;
    }
    void this.sendChunk(blob, isFirst);
  }

  private connect(): void {
    const url = whisperWebSocketUrl(
      this.options.sessionId,
      this.options.language,
    );
    if (!url) {
      this.options.onError(
        "未配置免费 Whisper 后端，无法使用 backend_ws 实时转写。",
      );
      return;
    }
    const websocket = new WebSocket(url);
    this.websocket = websocket;
    websocket.onopen = () => {
      const buffered = this.buffer;
      this.buffer = [];
      for (const item of buffered) {
        void this.sendChunk(item.blob, item.isFirst);
      }
    };
    websocket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as {
          type?: string;
          text?: string;
          start_ms?: number;
          end_ms?: number;
          speaker?: string | null;
          is_mock?: boolean;
          message?: string;
        };
        if (message.type === "interim") {
          this.options.onInterim({
            type: "interim",
            text: message.text ?? "",
            startMs: message.start_ms ?? 0,
            endMs: message.end_ms ?? 0,
            isMock: message.is_mock,
          });
        } else if (message.type === "final") {
          this.options.onFinal({
            type: "final",
            text: message.text ?? "",
            startMs: message.start_ms ?? 0,
            endMs: message.end_ms ?? 0,
            speaker: message.speaker ?? null,
            isMock: message.is_mock,
          });
        } else if (message.type === "error") {
          this.options.onError(message.message ?? "实时转写不可用");
        }
      } catch {
        this.options.onError("实时转写返回了无法解析的消息。");
      }
    };
    websocket.onerror = () => {
      this.options.onError("实时转写连接失败，录音会继续进行。");
    };
    websocket.onclose = () => {
      this.websocket = null;
      if (this.active && !this.paused) {
        this.reconnectTimer = window.setTimeout(() => this.connect(), 1500);
      }
    };
  }

  private async sendChunk(blob: Blob, isFirst: boolean): Promise<void> {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      return;
    }
    const nowMs = Math.round(this.options.getElapsedSeconds() * 1000);
    this.websocket.send(
      JSON.stringify({
        type: "audio_chunk",
        data: await blobToBase64(blob),
        is_first: isFirst,
        mime: blob.type || "audio/webm",
        start_ms: Math.max(0, nowMs - 1500),
        end_ms: nowMs,
      }),
    );
  }

  /**
   * 先发 end，等服务端把最后一句 final 回传后再关闭，避免丢掉结尾字幕。
   */
  private sendEndAndClose(): void {
    const socket = this.websocket;
    this.websocket = null;
    if (!socket) {
      return;
    }
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "end" }));
      window.setTimeout(() => socket.close(), 800);
      return;
    }
    socket.close();
  }
}

function funasrWebSocketUrl(sessionId: string, language: string): string | null {
  const base = process.env.NEXT_PUBLIC_FUNASR_API_URL;
  if (!base) {
    return null;
  }
  const wsBase = base.replace(/^http/, "ws").replace(/\/$/, "");
  return `${wsBase}/ws/sessions/${sessionId}/live-transcribe?language=${encodeURIComponent(language)}`;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

function resampleFloat32(
  input: Float32Array,
  inputRate: number,
  outputRate: number,
): Float32Array {
  if (inputRate === outputRate) {
    return input;
  }
  const ratio = inputRate / outputRate;
  const outputLength = Math.max(1, Math.floor(input.length / ratio));
  const output = new Float32Array(outputLength);
  for (let index = 0; index < outputLength; index += 1) {
    const position = index * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, input.length - 1);
    const fraction = position - left;
    output[index] = input[left] * (1 - fraction) + input[right] * fraction;
  }
  return output;
}

class FunASRBackendProvider implements ASRProvider {
  private websocket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private audioContext: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private gainNode: GainNode | null = null;
  private active = false;
  private paused = false;
  private pendingFrames: ArrayBuffer[] = [];

  constructor(private readonly options: ASRProviderOptions) {}

  async start(stream?: MediaStream): Promise<void> {
    if (!stream) {
      this.options.onError("FunASR Provider 需要麦克风音频流。");
      return;
    }
    this.active = true;
    this.paused = false;
    this.connect();
    await this.setupAudio(stream);
  }

  stop(): void {
    this.active = false;
    this.paused = false;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.sendEndAndClose();
    this.pendingFrames = [];
    this.stopAudio();
  }

  pause(): void {
    this.paused = true;
    void this.audioContext?.suspend();
    this.sendEndAndClose();
  }

  resume(): void {
    this.paused = false;
    void this.audioContext?.resume();
    if (this.active && !this.websocket) {
      this.connect();
    }
  }

  private async setupAudio(stream: MediaStream): Promise<void> {
    const audioContext = new AudioContext();
    this.audioContext = audioContext;
    const source = audioContext.createMediaStreamSource(stream);
    this.source = source;
    const gain = audioContext.createGain();
    gain.gain.value = 0;
    this.gainNode = gain;

    if (audioContext.audioWorklet) {
      await audioContext.audioWorklet.addModule("/worklets/pcm-capture.js");
      const workletNode = new AudioWorkletNode(audioContext, "pcm-capture");
      workletNode.port.onmessage = (event) => {
        this.sendFrame(event.data as ArrayBuffer);
      };
      source.connect(workletNode);
      workletNode.connect(gain);
      gain.connect(audioContext.destination);
      this.workletNode = workletNode;
      await audioContext.resume();
      return;
    }

    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    let pending = new Float32Array(0);
    processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      const merged = new Float32Array(pending.length + input.length);
      merged.set(pending);
      merged.set(input, pending.length);
      const resampled = resampleFloat32(
        merged,
        audioContext.sampleRate,
        16000,
      );
      const frameSamples = Math.round(16000 * 0.3);
      let offset = 0;
      while (resampled.length - offset >= frameSamples) {
        const pcm = new Int16Array(frameSamples);
        for (let index = 0; index < frameSamples; index += 1) {
          const value = Math.max(
            -1,
            Math.min(1, resampled[offset + index]),
          );
          pcm[index] = value < 0 ? value * 0x8000 : value * 0x7fff;
        }
        this.sendFrame(pcm.buffer);
        offset += frameSamples;
      }
      pending = resampled.slice(offset);
    };
    source.connect(processor);
    processor.connect(gain);
    gain.connect(audioContext.destination);
    this.processorNode = processor;
    await audioContext.resume();
  }

  private stopAudio(): void {
    this.workletNode?.disconnect();
    this.processorNode?.disconnect();
    this.source?.disconnect();
    this.gainNode?.disconnect();
    this.workletNode = null;
    this.processorNode = null;
    this.source = null;
    this.gainNode = null;
    if (this.audioContext && this.audioContext.state !== "closed") {
      void this.audioContext.close();
    }
    this.audioContext = null;
  }

  private connect(): void {
    const url = funasrWebSocketUrl(
      this.options.sessionId,
      this.options.language,
    );
    if (!url) {
      this.options.onError("未配置 FunASR 后端地址。");
      return;
    }
    const websocket = new WebSocket(url);
    this.websocket = websocket;
    websocket.onopen = () => {
      const buffered = this.pendingFrames;
      this.pendingFrames = [];
      for (const frame of buffered) {
        this.sendFrame(frame);
      }
    };
    websocket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as {
          type?: string;
          text?: string;
          start_ms?: number;
          end_ms?: number;
          speaker?: string | null;
          message?: string;
        };
        if (message.type === "interim") {
          this.options.onInterim({
            type: "interim",
            text: message.text ?? "",
            startMs: message.start_ms ?? 0,
            endMs: message.end_ms ?? 0,
          });
        } else if (message.type === "final") {
          this.options.onFinal({
            type: "final",
            text: message.text ?? "",
            startMs: message.start_ms ?? 0,
            endMs: message.end_ms ?? 0,
            speaker: message.speaker ?? null,
          });
        } else if (message.type === "error") {
          this.options.onError(message.message ?? "FunASR 实时转写不可用。");
        }
      } catch {
        this.options.onError("FunASR 返回了无法解析的消息。");
      }
    };
    websocket.onerror = () => {
      this.options.onError("FunASR 连接失败，录音会继续进行。");
    };
    websocket.onclose = () => {
      this.websocket = null;
      if (this.active && !this.paused) {
        this.reconnectTimer = window.setTimeout(() => this.connect(), 1500);
      }
    };
  }

  private sendFrame(frame: ArrayBuffer): void {
    if (!this.active || this.paused) {
      return;
    }
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      this.pendingFrames.push(frame);
      if (this.pendingFrames.length > 30) {
        this.pendingFrames.shift();
      }
      return;
    }
    const nowMs = Math.round(this.options.getElapsedSeconds() * 1000);
    this.websocket.send(
      JSON.stringify({
        type: "audio",
        data: arrayBufferToBase64(frame),
        sample_rate: 16000,
        start_ms: Math.max(0, nowMs - 300),
        end_ms: nowMs,
      }),
    );
  }

  /**
   * 先发 end，等服务端把最后一句 final 回传后再关闭，避免丢掉结尾字幕。
   */
  private sendEndAndClose(): void {
    const socket = this.websocket;
    this.websocket = null;
    if (!socket) {
      return;
    }
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "end" }));
      window.setTimeout(() => socket.close(), 800);
      return;
    }
    socket.close();
  }
}

export function createASRProvider(
  settings: ASRSettings,
  options: ASRProviderOptions,
): ASRProvider {
  if (settings.provider === "funasr") {
    return new FunASRBackendProvider(options);
  }
  if (settings.provider === "mock") {
    return new MockProvider(options);
  }
  if (settings.provider === "backend_ws") {
    return new WhisperBackendProvider(options);
  }
  return new BrowserWebSpeechProvider(options);
}
