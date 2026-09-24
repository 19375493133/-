"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addGlossary,
  deleteGlossary,
  listGlossary,
} from "@/lib/api";
import {
  ASR_PROVIDER_LABELS,
  isFunASRConfigured,
  isWebSpeechProviderAvailable,
  loadASRSettings,
  saveASRSettings,
} from "@/lib/asr";
import type { ASRSettings, GlossaryEntry } from "@/lib/types";

export default function SettingsPage() {
  const [settings, setSettings] = useState<ASRSettings>(loadASRSettings);
  const [glossary, setGlossary] = useState<GlossaryEntry[]>([]);
  const [term, setTerm] = useState("");
  const [replacement, setReplacement] = useState("");
  const [category, setCategory] =
    useState<GlossaryEntry["category"]>("course_term");
  const [error, setError] = useState<string | null>(null);

  const loadGlossary = useCallback(async () => {
    try {
      setGlossary(await listGlossary());
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载词库失败");
    }
  }, []);

  useEffect(() => {
    void loadGlossary();
  }, [loadGlossary]);

  function updateSettings(next: Partial<ASRSettings>) {
    const merged = { ...settings, ...next };
    setSettings(merged);
    saveASRSettings(merged);
  }

  async function handleAddTerm() {
    if (!term.trim()) {
      return;
    }
    try {
      const created = await addGlossary({
        term: term.trim(),
        category,
        replacement: replacement.trim(),
      });
      setGlossary((items) => [...items, created]);
      setTerm("");
      setReplacement("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "词库保存失败");
    }
  }

  async function handleDeleteTerm(id: string) {
    try {
      await deleteGlossary(id);
      setGlossary((items) => items.filter((item) => item.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "词库删除失败");
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Button variant="ghost" asChild className="mb-4">
        <Link href="/">
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回首页
        </Link>
      </Button>

      <h1 className="mb-6 text-3xl font-bold">实时转写设置</h1>
      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}

      <Alert className="mb-6">
        <AlertTitle>隐私提示</AlertTitle>
        <AlertDescription>
          实时转写可能把音频或文本发送到浏览器厂商或云端服务。请遵守当地法律和课堂规定，
          必要时先征得老师同意。MockProvider 只生成模拟字幕，不会写入正式转写结果。
        </AlertDescription>
      </Alert>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-xl">转写 Provider</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-sky-500"
              checked={settings.realtimeEnabled}
              onChange={(event) =>
                updateSettings({ realtimeEnabled: event.target.checked })
              }
            />
            录音时开启实时转写
          </label>

          <div className="space-y-2">
            <Label>Provider</Label>
            <Select
              value={settings.provider}
              onValueChange={(value) =>
                updateSettings({ provider: value as ASRSettings["provider"] })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="funasr">
                  {ASR_PROVIDER_LABELS.funasr}（推荐中文）
                </SelectItem>
                <SelectItem value="webspeech">
                  {ASR_PROVIDER_LABELS.webspeech}
                </SelectItem>
                <SelectItem value="backend_ws">
                  {ASR_PROVIDER_LABELS.backend_ws}
                </SelectItem>
                <SelectItem value="mock">{ASR_PROVIDER_LABELS.mock}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {settings.provider === "webspeech"
                ? "使用浏览器内置语音识别。当前浏览器支持：" +
                  (isWebSpeechProviderAvailable() ? "是" : "否")
                : settings.provider === "funasr"
                  ? "使用 FunASR Paraformer 流式模型，针对普通话课堂优化，推荐中文场景。当前服务地址：" +
                    (isFunASRConfigured()
                      ? "已配置"
                      : "未配置（请设置 NEXT_PUBLIC_FUNASR_API_URL）")
                : settings.provider === "backend_ws"
                  ? "通过 WebSocket 把音频发送到免费 Whisper 后端，适合浏览器语音识别不可用时。"
                  : "只生成明确标记的 [MOCK] 模拟字幕，不写入正式转写结果。"}
            </p>
          </div>

          <div className="space-y-2">
            <Label>语言</Label>
            <Select
              value={settings.language}
              onValueChange={(value) =>
                updateSettings({ language: value as ASRSettings["language"] })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="zh">中文（优先）</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">个性化词库</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <Input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="课程术语 / 人名 / 缩写"
            />
            <Input
              value={replacement}
              onChange={(event) => setReplacement(event.target.value)}
              placeholder="推荐写法（可选）"
            />
            <Button type="button" onClick={() => void handleAddTerm()}>
              <Plus className="mr-1 h-4 w-4" />
              添加
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["course_term", "课程术语"],
                ["person", "人名"],
                ["abbreviation", "缩写"],
                ["other", "其他"],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                size="sm"
                variant={category === value ? "default" : "outline"}
                onClick={() => setCategory(value)}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="space-y-2">
            {glossary.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无词库条目。</p>
            ) : (
              glossary.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-md border p-2 text-sm"
                >
                  <span>
                    {item.term}
                    {item.replacement ? ` → ${item.replacement}` : ""}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {item.category}
                    </span>
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => void handleDeleteTerm(item.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
