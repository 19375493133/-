const { loadConfig, saveConfig } = require("../../utils/config");

Page({
  data: {
    url: "",
    draft: "",
    message: "",
  },

  onLoad() {
    const config = loadConfig();
    this.setData({ url: config.webUrl || "", draft: config.webUrl || "" });
    if (!config.webUrl) {
      this.setData({
        message:
          "还没有填网页地址。请注意：web-view 仅企业/组织主体可用，且域名需 ICP 备案。",
      });
    }
  },

  onInput(event) {
    this.setData({ draft: event.detail.value });
  },

  open() {
    const url = (this.data.draft || "").trim();
    if (!url) {
      wx.showToast({ title: "请先填写网址", icon: "none" });
      return;
    }
    saveConfig(Object.assign(loadConfig(), { webUrl: url }));
    this.setData({ url, message: "" });
  },

  onError(event) {
    this.setData({
      message: `网页加载失败：${JSON.stringify(event.detail)}（通常是域名没在小程序后台配置为业务域名）`,
    });
  },
});
