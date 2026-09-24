const api = require("../../utils/api");

Page({
  data: {
    sessionId: "",
    session: null,
    transcript: [],
    points: [],
    counts: {},
    markdown: "",
    loading: true,
    error: "",
  },

  onLoad(options) {
    this.sessionId = options.id;
    this.setData({ sessionId: options.id });
    this.load();
  },

  load() {
    this.setData({ loading: true, error: "" });
    Promise.all([
      api.getSession(this.sessionId),
      api.listTranscript(this.sessionId),
    ])
      .then(([session, transcript]) =>
        this.setData({ session, transcript: transcript || [] }),
      )
      .then(() => api.analyzeSession(this.sessionId))
      .then((analysis) =>
        this.setData({
          points: analysis.points || [],
          counts: analysis.counts || {},
        }),
      )
      .then(() => api.getMindMapOutline(this.sessionId))
      .then((outline) => this.setData({ markdown: outline.markdown || "", loading: false }))
      .catch((error) => this.setData({ error: error.message, loading: false }));
  },

  onPullDownRefresh() {
    this.load();
    wx.stopPullDownRefresh();
  },

  copyMarkdown() {
    wx.setClipboardData({
      data: this.data.markdown,
      success: () => wx.showToast({ title: "已复制大纲", icon: "success" }),
    });
  },
});
