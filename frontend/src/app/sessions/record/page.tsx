import { Suspense } from "react";

import SessionRecordClient from "./session-record-client";

/** 录音页：静态路由 + 查询参数（/sessions/record/?id=...）。原因见 ../detail/page.tsx。 */
export default function Page() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-5xl px-6 py-10 text-muted-foreground">
          正在加载会话...
        </main>
      }
    >
      <SessionRecordClient />
    </Suspense>
  );
}
