// 聆听 · 云函数「initdb」
//
// 云开发数据库是「集合 + 文档」结构，没有建表语句；这个函数负责：
//   1. 创建用到的集合：sessions（听课会话）、transcripts（转写）、notes（重点与笔记）
//   2. 写一条 _meta 配置文档，标记初始化时间与结构版本
// 重复执行是安全的（集合已存在会返回提示，不会报错中断）。

const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const COLLECTIONS = ["sessions", "transcripts", "notes", "_meta"];

exports.main = async () => {
  const results = [];

  for (const name of COLLECTIONS) {
    try {
      await db.createCollection(name);
      results.push({ collection: name, status: "created" });
    } catch (error) {
      const code = error && (error.errCode || error.code);
      // -501001 / 已存在 都视为正常
      if (String(code) === "-501001") {
        results.push({ collection: name, status: "exists" });
      } else {
        results.push({
          collection: name,
          status: "failed",
          message: (error && error.errMsg) || String(error),
        });
      }
    }
  }

  try {
    const meta = db.collection("_meta");
    const existing = await meta.where({ key: "schema" }).get();
    if (existing.data.length === 0) {
      await meta.add({
        data: {
          key: "schema",
          version: 1,
          app: "聆听",
          collections: COLLECTIONS,
          createdAt: new Date(),
        },
      });
      results.push({ meta: "schema 写入完成" });
    } else {
      results.push({ meta: "schema 已存在" });
    }
  } catch (error) {
    results.push({ meta: "写入失败", message: (error && error.errMsg) || String(error) });
  }

  return { ok: true, results };
};
