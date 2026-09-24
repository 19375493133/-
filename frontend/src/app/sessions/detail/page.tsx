import { Suspense } from "react";

import SessionDetailClient from "./session-detail-client";

/**
 * 会话详情页：静态路由 + 查询参数（/sessions/detail/?id=...）。
 *
 * 为什么不用动态路由 /sessions/[id]：静态导出时这些路径没有对应的 HTML 文件，
 * 只能靠托管平台的 rewrite 规则兜底，而 Next 的客户端路由只认识构建期生成的
 * 那一个参数——实测线上会出现地址栏被改写成占位参数，或者直接渲染 404。
 * 改成静态路径 + 查询参数后，任何静态托管都能正常工作。
 *
 * useSearchParams 在静态渲染时首次返回空值、hydration 后再更新，
 * 所以必须包一层 Suspense，这里同时兼作加载态。
 */
export default function Page() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-5xl px-6 py-10 text-muted-foreground">
          加载中...
        </main>
      }
    >
      <SessionDetailClient />
    </Suspense>
  );
}
