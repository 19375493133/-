import { Suspense } from "react";

import SessionMindMapClient from "./session-mindmap-client";

/** 思维导图页：静态路由 + 查询参数（/sessions/mindmap/?id=...）。原因见 ../detail/page.tsx。 */
export default function Page() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-5xl px-6 py-10 text-muted-foreground">
          正在生成思维导图...
        </main>
      }
    >
      <SessionMindMapClient />
    </Suspense>
  );
}
