/** @type {import('next').NextConfig} */
// 静态导出模式：给 Cloudflare Pages 这类纯静态托管用（构建时设 NEXT_OUTPUT=export）。
// 本机 next dev 和 .tools/start-public.ps1（next start）都不设这个变量，
// 所以它们仍然走服务端渲染，rewrites 反代照旧可用。
const isStaticExport = process.env.NEXT_OUTPUT === "export";

const nextConfig = {
  reactStrictMode: true,
  // 公网实例用独立的构建目录，避免和本机 dev 实例抢 .next。
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // 静态导出不支持 rewrites，所以「静态导出」和「本机反代」按模式二选一。
  ...(isStaticExport
    ? {
        output: "export",
        trailingSlash: true,
      }
    : {
        async rewrites() {
          // 公网实例把 /api 反代到本机后端，前端和后端同源，省掉 CORS 和额外隧道。
          // 本机 dev 实例不受影响（它直连 http://127.0.0.1:8000）。
          return [
            {
              source: "/api/:path*",
              destination: `${process.env.API_PROXY_TARGET || "http://127.0.0.1:8000"}/api/:path*`,
            },
          ];
        },
      }),
};

export default nextConfig;
