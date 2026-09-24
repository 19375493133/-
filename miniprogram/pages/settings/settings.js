const { loadConfig, saveConfig } = require("../../utils/config");

Page({
  data: {
    mode: "cloudfn",
    cloudEnv: "",
    cloudService: "classroom-assistant",
    apiBase: "",
    wsBase: "",
    webUrl: "",
    saved: false,
  },

  onLoad() {
    this.setData(loadConfig());
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [field]: event.detail.value, saved: false });
  },

  selectMode(event) {
    this.setData({ mode: event.currentTarget.dataset.value, saved: false });
  },

  save() {
    const config = saveConfig({
      mode: this.data.mode,
      cloudEnv: (this.data.cloudEnv || "").trim(),
      cloudService: (this.data.cloudService || "").trim() || "classroom-assistant",
      apiBase: (this.data.apiBase || "").trim(),
      wsBase: (this.data.wsBase || "").trim(),
      webUrl: (this.data.webUrl || "").trim(),
    });
    this.setData({ ...config, saved: true });
    wx.showToast({ title: "已保存", icon: "success" });
  },

  fillFromApiBase() {
    const apiBase = (this.data.apiBase || "").trim().replace(/\/+$/, "");
    if (!apiBase) {
      wx.showToast({ title: "先填后端地址", icon: "none" });
      return;
    }
    const wsBase = apiBase.replace(/^http/, "ws") + "/funasr";
    this.setData({ wsBase, saved: false });
  },
});
