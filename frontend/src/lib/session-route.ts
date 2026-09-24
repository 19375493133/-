"use client";

import { useSearchParams } from "next/navigation";

/**
 * 取当前页面对应的会话 id（来自查询参数 ?id=...）。
 *
 * 为什么不用动态路由 /sessions/[id]：
 * 静态导出（Cloudflare Pages 等）时这些路径没有对应的 HTML 文件，只能靠托管平台
 * 的 rewrite 规则兜底，而 Next 的客户端路由只认识构建期生成的那一个参数。
 * 实测线上会出现两种坏情况：地址栏被改写成占位参数、或者直接渲染 404。
 * 改成静态路径 + 查询参数之后，任何静态托管都能正常工作。
 *
 * useSearchParams 在静态渲染时首帧返回空值、hydration 之后再更新，
 * 所以用到它的页面必须包一层 Suspense（见各目录下的 page.tsx）。
 */
export function useSessionId(): string | null {
  const searchParams = useSearchParams();
  const raw = searchParams.get("id");
  if (!raw) {
    return null;
  }
  const id = raw.trim();
  return id ? id : null;
}
