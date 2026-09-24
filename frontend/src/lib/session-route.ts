"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/** 构建期为了满足静态导出而生成的占位参数，真实 URL 里永远不会出现它。 */
const PLACEHOLDER_ID = "_placeholder";

/**
 * 从真实 URL 里解析会话 id。
 *
 * 为什么不用 next/navigation 的 useParams()：
 * 静态导出（Cloudflare Pages）时 /sessions/<id> 这类路径没有对应的 HTML 文件，
 * 靠托管平台的 rewrite 规则打到构建期生成的占位页上。这种"同一个 HTML 服务多条
 * 路径"的情况下，Next 会把构建时的占位参数当成真实参数，useParams() 返回的是
 * "_placeholder" 而不是地址栏里的 id。所以这里直接从 location.pathname 解析。
 *
 * /sessions/new 是静态页面，不是会话详情，返回 null。
 */
export function parseSessionId(pathname: string): string | null {
  const match = /^\/sessions\/([^/]+)(?:\/|$)/.exec(pathname);
  if (!match) {
    return null;
  }
  let id = match[1];
  try {
    id = decodeURIComponent(id);
  } catch {
    // 地址里有非法转义就按原样用。
  }
  if (!id || id === PLACEHOLDER_ID || id === "new") {
    return null;
  }
  return id;
}

/**
 * 返回当前页面对应的会话 id；还没解析出来时返回 null。
 *
 * 首帧固定是 null（服务端和客户端一致，避免 hydration 不匹配），
 * 挂载后再读地址栏，并跟随浏览器前进/后退同步。
 */
export function useSessionId(): string | null {
  // usePathname 会在客户端路由跳转时变化，用它当依赖可以覆盖
  // 「next/link 软跳转（pushState）」和「浏览器前进/后退（popstate）」两种情况。
  const pathname = usePathname();
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setSessionId(parseSessionId(window.location.pathname));
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [pathname]);

  return sessionId;
}
