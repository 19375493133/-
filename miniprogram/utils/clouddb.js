// 云开发数据库：把课堂记录存一份到云端，换手机也能看到。
// 集合结构见 cloudbase/README.md；集合由云函数 initdb 创建。
const { loadConfig } = require("./config");

let initedEnv = null;

function ensureReady() {
  const config = loadConfig();
  if (config.mode === "custom") {
    return null; // 自建域名模式不写云数据库
  }
  if (!wx.cloud) {
    throw new Error("当前基础库不支持云开发");
  }
  if (!config.cloudEnv) {
    throw new Error("还没有填云开发环境 ID");
  }
  if (initedEnv !== config.cloudEnv) {
    wx.cloud.init({ env: config.cloudEnv, traceUser: true });
    initedEnv = config.cloudEnv;
  }
  return wx.cloud.database();
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

/**
 * 保存一次课堂记录的快照：
 * sessions 一条主记录 + transcripts / notes 各若干条（只存前 200 条，避免一次写入过大）。
 */
function saveSessionSnapshot({
  backendSessionId,
  session,
  durationSeconds,
  transcript,
  highlights,
}) {
  let db;
  try {
    db = ensureReady();
  } catch (error) {
    return Promise.reject(error);
  }
  if (!db) {
    return Promise.resolve(null);
  }

  const task = db
    .collection("sessions")
    .add({
      data: {
        backendSessionId,
        title: (session && session.title) || "未命名记录",
        course: (session && session.course) || "",
        teacher: (session && session.teacher) || "",
        date: (session && session.date) || "",
        status: (session && session.status) || "done",
        duration: durationSeconds || 0,
        source: "miniprogram",
        createdAt: nowSeconds(),
      },
    })
    .then((res) => {
      const sessionId = res._id;
      const jobs = [];
      (transcript || []).slice(0, 200).forEach((item) => {
        jobs.push(
          db.collection("transcripts").add({
            data: {
              sessionId,
              backendSessionId,
              text: item.text,
              startSeconds: item.start_seconds,
              endSeconds: item.end_seconds,
              speaker: item.speaker || "",
              source: item.source || "realtime",
              createdAt: nowSeconds(),
            },
          }),
        );
      });
      (highlights || []).slice(0, 200).forEach((item) => {
        jobs.push(
          db.collection("notes").add({
            data: {
              sessionId,
              backendSessionId,
              type: item.type,
              content: item.content,
              timestampSeconds: item.timestamp_seconds,
              createdAt: nowSeconds(),
            },
          }),
        );
      });
      return Promise.all(jobs).then(() => ({ sessionId, count: jobs.length }));
    });

  return task;
}

/** 读出当前用户的最近记录（云开发自动按 _openid 隔离）。 */
function listSnapshots(limit) {
  let db;
  try {
    db = ensureReady();
  } catch (error) {
    return Promise.reject(error);
  }
  if (!db) {
    return Promise.resolve([]);
  }
  return db
    .collection("sessions")
    .orderBy("createdAt", "desc")
    .limit(limit || 20)
    .get()
    .then((res) => res.data || []);
}

module.exports = { saveSessionSnapshot, listSnapshots };
