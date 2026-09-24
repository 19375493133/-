const api = require("../../utils/api");
const { loadConfig } = require("../../utils/config");

Page({
  data: {
    sessions: [],
    loading: false,
    error: "",
    apiBase: "",
    webUrl: "",
    modeLabel: "",
    needConfig: false,
  },

  onShow() {
    const config = loadConfig();
    const cloudfnReady = config.mode === "cloudfn" && config.cloudEnv;
    const cloudReady = config.mode === "cloud" && config.cloudEnv;
    const customReady = config.mode === "custom" && config.apiBase;
    this.setData({
      apiBase: config.apiBase,
      webUrl: config.webUrl,
      modeLabel: cloudfnReady
        ? `云函数代理 · ${config.cloudEnv}`
        : cloudReady
          ? `微信云托管 · ${config.cloudService}`
          : customReady
            ? `自建域名 · ${config.apiBase}`
            : "还没有配置",
      needConfig: !(cloudfnReady || cloudReady || customReady),
    });
    this.refresh();
  },

  onPullDownRefresh() {
    this.refresh().then(() => wx.stopPullDownRefresh());
  },

  refresh() {
    this.setData({ loading: true, error: "" });
    return api
      .listSessions()
      .then((sessions) => this.setData({ sessions: sessions || [], loading: false }))
      .catch((error) => this.setData({ error: error.message, loading: false }));
  },

  createSession() {
    wx.showModal({
      title: "新建听课会话",
      editable: true,
      placeholderText: "例如：高等数学：极限",
      success: (res) => {
        if (!res.confirm || !res.content || !res.content.trim()) {
          return;
        }
        const today = new Date().toISOString().slice(0, 10);
        api
          .createSession({
            title: res.content.trim(),
            course: "",
            teacher: "",
            date: today,
          })
          .then((session) => {
            wx.navigateTo({ url: `/pages/record/record?id=${session.id}` });
          })
          .catch((error) => wx.showToast({ title: error.message, icon: "none" }));
      },
    });
  },

  openRecord(event) {
    wx.navigateTo({ url: `/pages/record/record?id=${event.currentTarget.dataset.id}` });
  },

  openDetail(event) {
    wx.navigateTo({ url: `/pages/detail/detail?id=${event.currentTarget.dataset.id}` });
  },

  openSettings() {
    wx.navigateTo({ url: "/pages/settings/settings" });
  },

  openWebview() {
    wx.navigateTo({ url: "/pages/webview/webview" });
  },
});
