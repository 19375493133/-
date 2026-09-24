// 后端接口封装：和 H5 版调用的是同一套 FastAPI（/api/...）。
// 支持两种通道：微信云托管（callContainer，不用配域名/公网）与自建域名（wx.request）。
const { getApiBase, useCloud } = require("./config");
const cloud = require("./cloud");
const cloudfn = require("./cloudfn");

function currentMode() {
  return require("./config").loadConfig().mode;
}

function request({ path, method = "GET", data, header }) {
  const mode = currentMode();
  if (mode === "cloudfn") {
    return cloudfn.callApi({ path, method, data });
  }
  if (mode === "cloud") {
    return cloud.callContainer({ path, method, data, header });
  }
  const apiBase = getApiBase();
  if (!apiBase) {
    return Promise.reject(
      new Error("还没有配置后端地址，请先到「设置」里选择云托管或填写域名"),
    );
  }
  return new Promise((resolve, reject) => {
    wx.request({
      url: apiBase + path,
      method,
      data,
      header: Object.assign({ "Content-Type": "application/json" }, header || {}),
      timeout: 30000,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
          return;
        }
        const detail = res.data && (res.data.detail || res.data.message);
        reject(new Error(detail || `请求失败（${res.statusCode}）`));
      },
      fail(err) {
        reject(new Error(err.errMsg || "网络请求失败"));
      },
    });
  });
}

function readFileBase64(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: "base64",
      success: (res) => resolve(res.data),
      fail: (err) => reject(new Error((err && err.errMsg) || "读取本地音频失败")),
    });
  });
}

/**
 * 上传一个音频分片。
 * - 云托管通道：callContainer 只能发 JSON，所以音频转 base64 走 /chunks/base64
 * - 自建域名通道：用 wx.uploadFile 走原来的 multipart 接口
 */
function uploadChunkFile({ sessionId, filePath, formData }) {
  const mode = currentMode();
  if (mode === "cloudfn" || mode === "cloud") {
    return readFileBase64(filePath).then((data) =>
      (mode === "cloudfn" ? cloudfn.callApi : cloud.callContainer)({
        path: `/api/sessions/${sessionId}/chunks/base64`,
        method: "POST",
        data: Object.assign({}, formData, {
          content_type: "audio/wav",
          data_base64: data,
        }),
      }),
    );
  }
  return uploadFile({ path: `/api/sessions/${sessionId}/chunks`, filePath, formData });
}

function uploadFile({ path, filePath, formData }) {
  const apiBase = getApiBase();
  if (!apiBase) {
    return Promise.reject(new Error("还没有配置后端地址"));
  }
  // wx.uploadFile 的 formData 只接受字符串
  const stringForm = {};
  Object.keys(formData || {}).forEach((key) => {
    stringForm[key] = String(formData[key]);
  });
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: apiBase + path,
      filePath,
      name: "file",
      formData: stringForm,
      timeout: 120000,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(res.data));
          } catch (error) {
            reject(new Error("上传返回内容无法解析"));
          }
          return;
        }
        reject(new Error(`上传失败（${res.statusCode}）`));
      },
      fail(err) {
        reject(new Error(err.errMsg || "上传失败"));
      },
    });
  });
}

const listSessions = () => request({ path: "/api/sessions" });

const createSession = (payload) =>
  request({ path: "/api/sessions", method: "POST", data: payload });

const getSession = (id) => request({ path: `/api/sessions/${id}` });

const getSessionStatus = (id) => request({ path: `/api/sessions/${id}/status` });

const listTranscript = (id) =>
  request({ path: `/api/sessions/${id}/transcript?source=realtime` });

const addTranscriptSegment = (id, payload) =>
  request({ path: `/api/sessions/${id}/transcript`, method: "POST", data: payload });

const listHighlights = (id) => request({ path: `/api/sessions/${id}/highlights` });

const addHighlight = (id, payload) =>
  request({ path: `/api/sessions/${id}/highlights`, method: "POST", data: payload });

const analyzeSession = (id) =>
  request({ path: `/api/sessions/${id}/analyze?prefer=auto`, method: "POST" });

const getMindMapOutline = (id) => request({ path: `/api/sessions/${id}/mindmap` });

const finalizeSession = (id, realtimeTranscribeEnabled) =>
  request({
    path: `/api/sessions/${id}/finalize`,
    method: "POST",
    data: { realtime_transcribe_enabled: !!realtimeTranscribeEnabled },
  });

module.exports = {
  request,
  uploadFile,
  uploadChunkFile,
  listSessions,
  createSession,
  getSession,
  getSessionStatus,
  listTranscript,
  addTranscriptSegment,
  listHighlights,
  addHighlight,
  analyzeSession,
  getMindMapOutline,
  finalizeSession,
};
