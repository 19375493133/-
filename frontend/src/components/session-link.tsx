"use client";

import type { AnchorHTMLAttributes, ReactNode } from "react";

/**
 * 指向 `/sessions/<id>` 这类动态路由的链接。静态路由（`/`、`/sessions/new`）继续用
 * next/link 就行，只有带会话 id 的跳转需要用它。
 *
 * 为什么不用 next/link：
 * 静态导出（Cloudflare Pages）时，这些路径没有对应的 HTML 文件，是靠托管平台的
 * rewrite 规则打到构建期生成的占位页上的。这种情况下 Next 的客户端路由会把地址
 * 规范化成占位参数——实测地址栏真的会变成 `/sessions/_placeholder/`，真实 id 就丢了。
 * 用原生 <a> 强制浏览器整页跳转，让托管平台和页面自己去解析地址栏，id 才不会丢。
 */
export function SessionLink({
  href,
  children,
  ...rest
}: {
  href: string;
  children: ReactNode;
} & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a href={href} {...rest}>
      {children}
    </a>
  );
}
