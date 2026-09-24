"""可选的 LLM 大纲生成。

默认**不启用**：只有配置了 `LLM_API_KEY`（或 `OPENAI_API_KEY`）才会调用。
没配置时接口返回本地大纲，并带上明确提示，绝不伪造「AI 生成」的结果。

支持任何 OpenAI 兼容的 Chat Completions 接口（含本地部署的模型）。
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass

import httpx

from .outline import OUTLINE_SYSTEM_PROMPT

DEFAULT_BASE_URL = "https://api.openai.com/v1"
DEFAULT_MODEL = "gpt-4o-mini"
DEFAULT_TIMEOUT_SECONDS = 60.0
MAX_OUTPUT_CHARS = 20000

_FENCE_PATTERN = re.compile(r"^```[a-zA-Z]*\s*|\s*```$")


@dataclass(frozen=True)
class LLMSettings:
    base_url: str
    api_key: str
    model: str
    timeout_seconds: float

    @property
    def configured(self) -> bool:
        return bool(self.api_key and self.base_url and self.model)


def load_llm_settings() -> LLMSettings:
    """每次调用都重新读环境变量，方便改完 .env 直接生效。"""
    return LLMSettings(
        base_url=(os.getenv("LLM_BASE_URL") or DEFAULT_BASE_URL).rstrip("/"),
        api_key=(os.getenv("LLM_API_KEY") or os.getenv("OPENAI_API_KEY") or "").strip(),
        model=(os.getenv("LLM_MODEL") or DEFAULT_MODEL).strip(),
        timeout_seconds=float(
            os.getenv("LLM_TIMEOUT_SECONDS") or DEFAULT_TIMEOUT_SECONDS
        ),
    )


def clean_markdown(raw: str) -> str:
    """去掉代码块围栏和多余空行，只保留 Markdown 正文。"""
    text = (raw or "").strip()
    text = _FENCE_PATTERN.sub("", text).strip()
    text = re.sub(r"\n{3,}", "\n\n", text)
    if len(text) > MAX_OUTPUT_CHARS:
        text = text[:MAX_OUTPUT_CHARS].rstrip() + "\n"
    return text


def is_usable_outline(markdown: str) -> bool:
    """粗略校验模型输出：至少要有标题或列表项。"""
    text = (markdown or "").strip()
    if len(text) < 10:
        return False
    return text.startswith("#") or "\n-" in text or "\n##" in text or "\n*" in text


def generate_outline_markdown(
    user_prompt: str,
    *,
    settings: LLMSettings | None = None,
) -> tuple[str | None, str | None]:
    """调用 LLM 生成 Markdown 大纲。

    返回 `(markdown, error)`：成功时 error 为 None；失败时 markdown 为 None。
    """
    content, error = chat_completion(
        OUTLINE_SYSTEM_PROMPT, user_prompt, settings=settings
    )
    if content is None:
        return None, error

    markdown = clean_markdown(content)
    if not is_usable_outline(markdown):
        return None, "LLM 返回的内容不是有效的 Markdown 大纲"
    return markdown, None


def chat_completion(
    system_prompt: str,
    user_prompt: str,
    *,
    settings: LLMSettings | None = None,
    temperature: float = 0.2,
) -> tuple[str | None, str | None]:
    """调用 OpenAI 兼容的 chat/completions，返回 (内容, 错误)。"""
    config = settings or load_llm_settings()
    if not config.configured:
        return None, "未配置 LLM（需要 LLM_API_KEY / LLM_BASE_URL / LLM_MODEL）"

    payload = {
        "model": config.model,
        "temperature": temperature,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }
    headers = {
        "Authorization": f"Bearer {config.api_key}",
        "Content-Type": "application/json",
    }

    try:
        response = httpx.post(
            f"{config.base_url}/chat/completions",
            json=payload,
            headers=headers,
            timeout=config.timeout_seconds,
        )
    except httpx.HTTPError as exc:  # 网络/超时
        return None, f"调用 LLM 失败：{exc}"

    if response.status_code >= 400:
        detail = response.text[:200].replace("\n", " ")
        return None, f"LLM 返回 {response.status_code}：{detail}"

    try:
        data = response.json()
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        return None, f"无法解析 LLM 返回内容：{exc}"

    text = str(content).strip()
    if not text:
        return None, "LLM 返回了空内容"
    return text, None
