import SessionRecordClient from "./session-record-client";

// 说明同 ../page.tsx：占位参数只为满足静态导出的构建要求，
// 真实 id 由客户端用 useParams() 从 URL 读取。
export function generateStaticParams() {
  return [{ id: "_placeholder" }];
}

export default function Page() {
  return <SessionRecordClient />;
}
