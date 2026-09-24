// 后端地址保存在本地，页面上可以随时改（设置页）。
// 注意：正式使用时这些域名必须在小程序后台「开发设置-服务器域名」里配置，
// 或者改用微信云托管（callContainer / connectContainer，免配置域名）。
const STORAGE_KEY = "classroom.config.v1";

const DEFAULTS = {
  // 连接方式：cloudfn = 云函数转发（微信内网，免域名免备案，推荐）
  //           cloud   = 微信云托管（callContainer / connectContainer，支持实时字幕）
  //           custom  = 自建域名（需在小程序后台配置服务器域名）
  mode: "cloudfn",
  // 云托管环境 ID（云托管控制台-环境设置里能看到）
  cloudEnv: "",
  // 云托管服务名（部署时填的服务名称）
  cloudService: "classroom-assistant",
  // 例如 https://xxxx.modelscope.space （我们的 deploy/space 容器地址）
  apiBase: "",
  // 实时字幕用的 WebSocket 地址，通常是 apiBase 换成 wss + /funasr
  // 例如 wss://xxxx.modelscope.space/funasr
  wsBase: "",
  // 可选的 H5 地址：给企业主体的小程序用 web-view 套壳
  webUrl: "",
};

function loadConfig() {
  try {
    const saved = wx.getStorageSync(STORAGE_KEY);
    if (saved && typeof saved === "object") {
      return Object.assign({}, DEFAULTS, saved);
    }
  } catch (error) {
    console.warn("读取配置失败", error);
  }
  return Object.assign({}, DEFAULTS);
}

function saveConfig(config) {
  const merged = Object.assign({}, DEFAULTS, config || {});
  wx.setStorageSync(STORAGE_KEY, merged);
  const app = getApp();
  if (app && app.globalData) {
    app.globalData.config = merged;
  }
  return merged;
}

function getApiBase() {
  return loadConfig().apiBase.replace(/\/+$/, "");
}

function getWsBase() {
  return loadConfig().wsBase.replace(/\/+$/, "");
}

function useCloud() {
  return loadConfig().mode === "cloud";
}

module.exports = {
  loadConfig,
  saveConfig,
  getApiBase,
  getWsBase,
  useCloud,
  STORAGE_KEY,
};
