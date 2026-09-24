import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createASRProvider,
  loadASRSettings,
  migrateLegacySettings,
} from "@/lib/asr";

describe("ASR providers", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.unstubAllEnvs();
  });

  it("loads realtime settings with a safe default", () => {
    const settings = loadASRSettings();
    expect(settings.realtimeEnabled).toBe(true);
    expect(["webspeech", "backend_ws", "mock"]).toContain(settings.provider);
    expect(settings.language).toBe("zh");
  });

  it("prefers funasr for the default provider when the service is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_FUNASR_API_URL", "http://127.0.0.1:8002");
    expect(loadASRSettings().provider).toBe("funasr");
  });

  it("upgrades a legacy backend_ws choice to funasr", () => {
    vi.stubEnv("NEXT_PUBLIC_FUNASR_API_URL", "http://127.0.0.1:8002");
    const migrated = migrateLegacySettings({
      realtimeEnabled: true,
      provider: "backend_ws",
      language: "zh",
    });
    expect(migrated.provider).toBe("funasr");
  });

  it("keeps a deliberate mock choice instead of silently upgrading", () => {
    vi.stubEnv("NEXT_PUBLIC_FUNASR_API_URL", "http://127.0.0.1:8002");
    const migrated = migrateLegacySettings({
      realtimeEnabled: true,
      provider: "mock",
      language: "zh",
    });
    expect(migrated.provider).toBe("mock");
  });

  it("migrates v1 localStorage settings into the v2 key", () => {
    vi.stubEnv("NEXT_PUBLIC_FUNASR_API_URL", "http://127.0.0.1:8002");
    window.localStorage.setItem(
      "classroom-listener.asr-settings.v1",
      JSON.stringify({
        realtimeEnabled: true,
        provider: "backend_ws",
        language: "zh",
      }),
    );

    expect(loadASRSettings().provider).toBe("funasr");
    const stored = window.localStorage.getItem(
      "classroom-listener.asr-settings.v2",
    );
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored as string).provider).toBe("funasr");
  });

  it("ignores a corrupted settings payload and falls back to defaults", () => {
    window.localStorage.setItem(
      "classroom-listener.asr-settings.v2",
      "{ not json",
    );
    const settings = loadASRSettings();
    expect(settings.realtimeEnabled).toBe(true);
    expect(settings.language).toBe("zh");
  });

  it("mock provider emits clearly marked mock subtitles", () => {
    vi.useFakeTimers();
    const events: string[] = [];
    const provider = createASRProvider(
      { realtimeEnabled: true, provider: "mock", language: "zh" },
      {
        sessionId: "test-session",
        language: "zh",
        getElapsedSeconds: () => 1,
        onInterim: (event) => events.push(event.text),
        onFinal: (event) => events.push(event.text),
        onError: () => undefined,
      },
    );
    provider.start();
    vi.advanceTimersByTime(1300);
    provider.stop();
    vi.useRealTimers();

    expect(events.some((text) => text.startsWith("[MOCK]"))).toBe(true);
  });
});
