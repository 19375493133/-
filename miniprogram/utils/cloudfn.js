// 云函数通道：小程序 → wx.cloud.callFunction（微信内网）→ 云函数 → 后端容器。
// 最大的好处是**不需要在小程序后台配置服务器域名**，也不用备案。
const { loadConfig } = require("./config");

let initedEnv = null;

function ensureInit(config) {
  if (!wx.cloud) {
    throw new Error("当前基础库不支持云开发，请在开发者工具里调高基础库版本");
  }
  if (!config.cloudEnv) {
    throw new Error("还没有填云开发环境 ID，请到「设置」里填写");
  }
  if (initedEnv !== config.cloudEnv) {
    wx.cloud.init({ env: config.cloudEnv, traceUser: true });
    initedEnv = config.cloudEnv;
  }
}

function callApi({ path, method = "GET", data, timeoutMs }) {
  let config;
  try {
    config = loadConfig();
    ensureInit(config);
  } catch (error) {
    return Promise.reject(error);
  }

  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: "api",
      data: { path, method, body: data, timeoutMs },
      success(res) {
        const result = (res && res.result) || {};
        const status = result.statusCode || 200;
        if (status >= 200 && status < 300) {
          resolve(result.data);
          return;
        }
        const detail =
          result.error ||
          (result.data && typeof result.data === "object" ? result.data.detail : result.data);
        reject(new Error(detail || `云函数返回 ${status}`));
      },
      fail(err) {
        reject(new Error((err && err.errMsg) || "云函数调用失败"));
      },
    });
  });
}

module.exports = { callApi };
