import { SessionForm } from "@/components/session-form";

export default function NewSessionPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">新建听课会话</h1>
        <p className="mt-2 text-muted-foreground">
          填写课程信息后即可开始录音。
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          本地优先：连接后端时数据存入后端；线上未连接后端时，会话会自动保存到当前浏览器。
        </p>
      </header>
      <SessionForm />
    </main>
  );
}
