import SessionDetailClient from "./session-detail-client";

// 静态导出（Cloudflare Pages）要求动态路由必须提供 generateStaticParams。
// 但会话 id 是运行时在浏览器里生成的，构建时不可能枚举出来，
// 所以这里只生成一个占位页，真实路径交给托管平台的 rewrite 规则打到它上面。
// 页面内部用 useParams() 读的是真实 URL，因此 id 依然正确。
// 非静态导出模式（本机 next dev / next start）下，这个函数只是额外预渲染一个
// 占位页，其余任意 id 仍然照常按需渲染。
export function generateStaticParams() {
  return [{ id: "_placeholder" }];
}

export default function Page() {
  return <SessionDetailClient />;
}
