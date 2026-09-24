// 聆听 · 云函数「api」
//
// 作用：小程序调用云函数（wx.cloud.callFunction）是走微信内网的，
// **不需要在小程序后台配置任何服务器域名**。这个函数把请求转发到后端容器，
// 于是小程序就彻底摆脱了「备案域名 / 公网隧道」。
//
// 配置：在云函数的环境变量里设置 BACKEND_BASE_URL，
//       例如 https://xxxx.modelscope.space 或你自己的服务器地址。

const http = require("http");
const https = require("https");
const { URL } = require("url");

// 只允许转发我们自己的接口，避免这个函数被当成万能代理
const ALLOWED_PREFIXES = [
  "/api/health",
  "/api/sessions",
  "/api/transcript",
  "/api/glossary",
];

const MAX_BODY_BYTES = 6 * 1024 * 1024; // 云函数请求体上限，音频分片请控制在 4MB 以内

function isAllowed(path) {
  return ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function requestOnce(target, method, payload, timeoutMs) {
  const transport = target.protocol === "http:" ? http : https;
  const options = {
    method,
    hostname: target.hostname,
    port: target.port || (target.protocol === "http:" ? 80 : 443),
    path: `${target.pathname}${target.search}`,
    headers: {
      "Content-Type": "application/json",
      "Content-Length": payload ? Buffer.byteLength(payload) : 0,
      "X-Lingting-Client": "wechat-miniprogram",
    },
  };

  return new Promise((resolve, reject) => {
    const req = transport.request(options, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let parsed = raw;
        try {
          parsed = raw ? JSON.parse(raw) : null;
        } catch (error) {
          // 非 JSON 就原样返回
        }
        resolve({ statusCode: res.statusCode || 200, data: parsed });
      });
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`后端请求超时（${timeoutMs}ms）`));
    });
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

exports.main = async (event) => {
  const started = Date.now();
  const baseUrl = (process.env.BACKEND_BASE_URL || "").trim();
  if (!baseUrl) {
    return {
      statusCode: 500,
      error: "云函数还没有配置 BACKEND_BASE_URL，请在云开发控制台给 api 函数加环境变量",
    };
  }

  const path = String((event && event.path) || "");
  const method = String((event && event.method) || "GET").toUpperCase();
  if (!path.startsWith("/") || !isAllowed(path)) {
    return { statusCode: 403, error: `不允许访问的路径：${path}` };
  }

  const body = event && event.body !== undefined ? event.body : null;
  let payload = null;
  if (body !== null && method !== "GET") {
    payload = Buffer.from(JSON.stringify(body), "utf8");
    if (payload.length > MAX_BODY_BYTES) {
      return {
        statusCode: 413,
        error: `请求体过大（${payload.length} 字节），音频分片请拆小一点`,
      };
    }
  }

  let target;
  try {
    target = new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  } catch (error) {
    return { statusCode: 500, error: `BACKEND_BASE_URL 不合法：${baseUrl}` };
  }

  const timeoutMs = Math.min(Number((event && event.timeoutMs) || 18000), 19000);

  try {
    const result = await requestOnce(target, method, payload, timeoutMs);
    return {
      statusCode: result.statusCode,
      data: result.data,
      elapsedMs: Date.now() - started,
    };
  } catch (error) {
    return {
      statusCode: 502,
      error: `转发到后端失败：${error.message}`,
      backend: `${target.origin}${target.pathname}`,
    };
  }
};
