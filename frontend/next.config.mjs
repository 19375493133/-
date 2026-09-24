/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 公网实例用独立的构建目录，避免和本机 dev 实例抢 .next。
  distDir: process.env.NEXT_DIST_DIR || ".next",
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
};

export default nextConfig;
