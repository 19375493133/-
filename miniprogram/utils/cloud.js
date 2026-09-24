// 微信云托管通道：小程序通过微信私有协议直接调容器，
// 不需要配置服务器域名，也不需要公网地址。
//   - HTTPS：wx.cloud.callContainer
//   - WebSocket：wx.cloud.connectContainer（基础库 2.23.0+）
const { loadConfig } = require("./config");

let initedEnv = null;

function ensureInit(config) {
  if (!wx.cloud) {
    throw new Error("当前基础库不支持云托管，请在开发者工具里把基础库调到 2.23.0 以上");
  }
  if (!config.cloudEnv) {
    throw new Error("还没有填云托管环境 ID，请到「设置」里填写");
  }
  if (initedEnv !== config.cloudEnv) {
    wx.cloud.init({ env: config.cloudEnv, traceUser: true });
    initedEnv = config.cloudEnv;
  }
}

function callContainer({ path, method = "GET", data, header }) {
  let config;
  try {
    config = loadConfig();
    ensureInit(config);
  } catch (error) {
    return Promise.reject(error);
  }

  return new Promise((resolve, reject) => {
    wx.cloud.callContainer({
      config: { env: config.cloudEnv },
      path,
      method,
      header: Object.assign(
        {
          "X-WX-SERVICE": config.cloudService,
          "content-type": "application/json",
        },
        header || {},
      ),
      data,
      success(res) {
        const status = res.statusCode || 200;
        if (status >= 200 && status < 300) {
          resolve(res.data);
          return;
        }
        const detail =
          res.data && typeof res.data === "object" ? res.data.detail : res.data;
        reject(new Error(detail || `云托管返回 ${status}`));
      },
      fail(err) {
        reject(new Error((err && err.errMsg) || "云托管调用失败"));
      },
    });
  });
}

function connectContainer({ path }) {
  let config;
  try {
    config = loadConfig();
    ensureInit(config);
  } catch (error) {
    return Promise.reject(error);
  }

  return new Promise((resolve, reject) => {
    let result;
    try {
      result = wx.cloud.connectContainer({
        config: { env: config.cloudEnv },
        service: config.cloudService,
        path,
      });
    } catch (error) {
      reject(error);
      return;
    }
    if (result && typeof result.then === "function") {
      result
        .then((res) => resolve(res.socketTask))
        .catch((error) => reject(new Error((error && error.errMsg) || "云托管连接失败")));
      return;
    }
    if (result && result.socketTask) {
      resolve(result.socketTask);
      return;
    }
    reject(new Error("云托管连接没有返回 socketTask"));
  });
}

module.exports = { callContainer, connectContainer };
