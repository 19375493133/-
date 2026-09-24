// 全局只保存配置，其余数据都放服务端（和我们 H5 版同一套后端）。
const { loadConfig } = require("./utils/config");

App({
  globalData: {
    config: null,
  },
  onLaunch() {
    this.globalData.config = loadConfig();
  },
});
