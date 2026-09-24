interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionResultListLike {
  length: number;
  [index: number]: SpeechRecognitionResultLike;
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
  message: string;
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export interface SpeechTranscriberOptions {
  sessionId: string;
  getElapsedSeconds: () => number;
  onFinal: (payload: {
    text: string;
    startSeconds: number;
    endSeconds: number;
    speaker?: string;
  }) => void;
  onInterim?: (text: string) => void;
  onError?: (message: string) => void;
}

export class SpeechTranscriber {
  private recognition: SpeechRecognitionLike | null = null;
  private active = false;
  private lastEndSeconds = 0;

  constructor(private readonly options: SpeechTranscriberOptions) {}

  start(): boolean {
    if (!isSpeechRecognitionSupported()) {
      this.options.onError?.("当前浏览器不支持实时转写，请使用最新版 Chrome 或 Edge。");
      return false;
    }
    this.active = true;
    this.lastEndSeconds = this.options.getElapsedSeconds();
    this.createAndStart();
    return true;
  }

  pause(): void {
    this.active = false;
    try {
      this.recognition?.stop();
    } catch {
      // Ignore stop failures.
    }
    this.recognition = null;
  }

  resume(): void {
    if (!isSpeechRecognitionSupported()) {
      return;
    }
    this.active = true;
    this.lastEndSeconds = this.options.getElapsedSeconds();
    this.createAndStart();
  }

  stop(): void {
    this.active = false;
    try {
      this.recognition?.stop();
    } catch {
      // Ignore stop failures.
    }
    this.recognition = null;
  }

  private createAndStart(): void {
    const Recognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => this.handleResult(event);
    recognition.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") {
        return;
      }
      if (event.error === "not-allowed") {
        this.options.onError?.("浏览器没有麦克风或语音识别权限。");
        this.active = false;
        return;
      }
      this.options.onError?.(`实时转写出错：${event.error}`);
    };
    recognition.onend = () => {
      if (!this.active) {
        return;
      }
      // Chrome 在静音一段时间后会结束识别，这里自动续接。
      window.setTimeout(() => {
        if (!this.active) {
          return;
        }
        try {
          recognition.start();
        } catch {
          this.createAndStart();
        }
      }, 250);
    };
    this.recognition = recognition;
    try {
      recognition.start();
    } catch {
      this.createAndStart();
    }
  }

  private handleResult(event: SpeechRecognitionEventLike): void {
    let interim = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const transcript = result[0]?.transcript?.trim() ?? "";
      if (!transcript) {
        continue;
      }
      if (result.isFinal) {
        const now = this.options.getElapsedSeconds();
        const start = Math.min(this.lastEndSeconds, now);
        const end = Math.max(now, start + 0.2);
        this.options.onFinal({
          text: transcript,
          startSeconds: start,
          endSeconds: end,
          speaker: "老师",
        });
        this.lastEndSeconds = end;
      } else {
        interim += transcript;
      }
    }
    if (interim) {
      this.options.onInterim?.(interim);
    }
  }
}
