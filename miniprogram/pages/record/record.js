const api = require("../../utils/api");
const audio = require("../../utils/audio");
const cloud = require("../../utils/cloud");
const clouddb = require("../../utils/clouddb");
const { getWsBase, useCloud, loadConfig } = require("../../utils/config");

const SAMPLE_RATE = 16000;
const FRAME_SIZE_KB = 6; // 约 192ms 一帧，配合 FunASR 的 600ms 分块
const SEGMENT_LIMIT_MS = 570000; // 官方单次上限 10 分钟，这里 9.5 分钟自动续录
// 边录边传：不同通道能承受的请求体大小不一样
const CHUNK_SECONDS = { cloudfn: 10, cloud: 20, custom: 30 };
const MARK_TYPES = [
  { value: "important", label: "重点" },
  { value: "difficult", label: "难点" },
  { value: "question", label: "问题" },
  { value: "note", label: "笔记" },
];

// wx.getRecorderManager() 是全局单例：监听器只能绑一次，
// 否则来回进出录音页会重复回调（同一帧被处理多次）。
let activePage = null;
let recorderBound = false;

Page({
  data: {
    sessionId: "",
    session: null,
    phase: "idle", // idle | recording | paused | uploading | done | error
    elapsedLabel: "00:00",
    bars: new Array(24).fill(4),
    interim: "",
    finals: [],
    highlights: [],
    error: "",
    speechHint: "",
    wsState: "未连接",
    markTypes: MARK_TYPES,
    markType: "important",
    markText: "",
    uploading: false,
    notice: "",
    uploadedChunks: 0,
  },

  onLoad(options) {
    const sessionId = options.id;
    this.sessionId = sessionId;
    this.recorder = wx.getRecorderManager();
    this.chunkFrames = [];
    this.chunkIndex = 0;
    this.chunkStartSeconds = 0;
    this.flushing = false;
    this.chunkSeconds = CHUNK_SECONDS[loadConfig().mode] || 30;
    this.levels = new Array(24).fill(4);
    this.keepRecording = false;
    this.stopping = false;
    this.socket = null;
    this.socketBuffer = [];
    activePage = this;
    this.bindRecorderOnce();
    this.setData({ sessionId });
    this.loadSession();
    this.loadHighlights();
    this.loadTranscript();
  },

  onUnload() {
    activePage = null;
    this.clearTimer();
    this.closeSocket();
    if (this.data.phase === "recording" || this.data.phase === "paused") {
      this.keepRecording = false;
      this.recorder.stop();
    }
  },

  /* ---------------- 数据加载 ---------------- */

  loadSession() {
    api
      .getSession(this.sessionId)
      .then((session) => this.setData({ session }))
      .catch((error) => this.setData({ error: error.message }));
  },

  loadHighlights() {
    api
      .listHighlights(this.sessionId)
      .then((highlights) => this.setData({ highlights: highlights || [] }))
      .catch(() => undefined);
  },

  loadTranscript() {
    api
      .listTranscript(this.sessionId)
      .then((segments) => this.setData({ finals: segments || [] }))
      .catch(() => undefined);
  },

  /* ---------------- 录音 ---------------- */

  ensurePermission() {
    return new Promise((resolve, reject) => {
      wx.getSetting({
        success: (res) => {
          if (res.authSetting["scope.record"]) {
            resolve(true);
            return;
          }
          wx.authorize({
            scope: "scope.record",
            success: () => resolve(true),
            fail: () =>
              reject(new Error("需要麦克风权限：请在右上角「⋯」里打开「使用我的麦克风」")),
          });
        },
        fail: () => resolve(true),
      });
    });
  },

  bindRecorderOnce() {
    if (recorderBound) {
      return;
    }
    recorderBound = true;
    const recorder = this.recorder;

    recorder.onFrameRecorded((res) => {
      const page = activePage;
      if (!page || !res.frameBuffer) {
        return;
      }
      page.chunkFrames.push(res.frameBuffer);
      const level = audio.analyseFrame(res.frameBuffer);
      page.levels = page.levels.slice(1).concat([Math.max(4, level)]);
      page.setData({ bars: page.levels });
      page.sendFrame(res.frameBuffer);
      // 到点了就把这一段传上去（边录边传，长课堂也不怕）
      const elapsed = page.elapsedSeconds();
      if (!page.flushing && elapsed - page.chunkStartSeconds >= page.chunkSeconds) {
        void page.flushChunk();
      }
    });

    recorder.onError((error) => {
      if (activePage) {
        activePage.setData({ error: (error && error.errMsg) || "录音出错" });
      }
    });

    recorder.onStop(() => {
      const page = activePage;
      if (!page) {
        return;
      }
      if (page.keepRecording) {
        // 到达单次上限（或系统中断）后自动续录，保证 45 分钟的课不断
        page.startRecorder();
        return;
      }
      page.finishRecording();
    });
  },

  start() {
    this.setData({ error: "", notice: "" });
    this.ensurePermission()
      .then(() => {
        this.chunkFrames = [];
        this.chunkIndex = 0;
        this.chunkStartSeconds = 0;
        this.flushing = false;
        this.keepRecording = true;
        this.stopping = false;
        this.startedAt = Date.now();
        this.pausedMs = 0;
        this.pausedAt = null;
        this.connectSocket();
        this.startRecorder();
        this.startTimer();
        this.setData({ phase: "recording", finals: [], interim: "" });
      })
      .catch((error) => this.setData({ error: error.message }));
  },

  startRecorder() {
    this.recorder.start({
      duration: SEGMENT_LIMIT_MS,
      sampleRate: SAMPLE_RATE,
      numberOfChannels: 1,
      encodeBitRate: 96000,
      format: "PCM",
      frameSize: FRAME_SIZE_KB,
    });
  },

  pause() {
    this.recorder.pause();
    this.pausedAt = Date.now();
    this.setData({ phase: "paused" });
  },

  resume() {
    if (this.pausedAt) {
      this.pausedMs += Date.now() - this.pausedAt;
      this.pausedAt = null;
    }
    this.recorder.resume();
    this.setData({ phase: "recording" });
  },

  stop() {
    this.keepRecording = false;
    this.stopping = true;
    this.sendEnd();
    this.recorder.stop();
    this.clearTimer();
    this.setData({ phase: "uploading", interim: "" });
  },

  /* ---------------- 计时 ---------------- */

  startTimer() {
    this.clearTimer();
    this.timer = setInterval(() => {
      this.setData({ elapsedLabel: audio.secondsToLabel(this.elapsedSeconds()) });
    }, 500);
  },

  clearTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  },

  elapsedSeconds() {
    if (!this.startedAt) {
      return 0;
    }
    let paused = this.pausedMs || 0;
    if (this.pausedAt) {
      paused += Date.now() - this.pausedAt;
    }
    return Math.max(0, (Date.now() - this.startedAt - paused) / 1000);
  },

  /* ---------------- 实时字幕 ---------------- */

  connectSocket() {
    const wsPath = `/funasr/ws/sessions/${this.sessionId}/live-transcribe?language=zh`;
    this.setData({ wsState: "连接中…" });

    let task = null;
    if (useCloud()) {
      // 云托管通道：微信私有协议直连容器，不需要配置 socket 合法域名
      cloud
        .connectContainer({ path: wsPath })
        .then((socketTask) => {
          this.attachSocket(socketTask);
        })
        .catch((error) =>
          this.setData({ wsState: "连接失败", speechHint: error.message }),
        );
      return;
    }

    const wsBase = getWsBase();
    if (!wsBase) {
      this.setData({
        wsState: "未配置实时转写地址",
        speechHint: "实时字幕不可用，录音和上传仍会继续。",
      });
      return;
    }
    task = wx.connectSocket({ url: `${wsBase}/ws/sessions/${this.sessionId}/live-transcribe?language=zh` });
    this.attachSocket(task);
  },

  attachSocket(task) {
    this.socket = task;
    if (!task) {
      return;
    }

    task.onOpen(() => {
      this.setData({ wsState: "已连接", speechHint: "" });
      const buffered = this.socketBuffer;
      this.socketBuffer = [];
      buffered.forEach((frame) => this.sendFrame(frame));
    });

    task.onMessage((res) => {
      let message = null;
      try {
        message = JSON.parse(res.data);
      } catch (error) {
        return;
      }
      if (message.type === "interim") {
        this.setData({ interim: message.text || "" });
      } else if (message.type === "final") {
        this.setData({ interim: "" });
        this.saveFinal(message);
      } else if (message.type === "error") {
        this.setData({ speechHint: message.message || "实时转写不可用" });
      }
    });

    task.onError(() =>
      this.setData({ wsState: "连接失败", speechHint: "实时转写连接失败，录音会继续。" }),
    );
    task.onClose(() => this.setData({ wsState: "已断开" }));
  },

  closeSocket() {
    if (this.socket) {
      try {
        this.socket.close({ code: 1000 });
      } catch (error) {
        // 忽略关闭异常
      }
      this.socket = null;
    }
  },

  sendFrame(frameBuffer) {
    if (!this.socket) {
      return;
    }
    const payload = {
      type: "audio",
      data: audio.base64FromArrayBuffer(frameBuffer),
      sample_rate: SAMPLE_RATE,
      start_ms: Math.round(this.elapsedSeconds() * 1000),
      end_ms: Math.round(this.elapsedSeconds() * 1000),
    };
    this.socket.send({
      data: JSON.stringify(payload),
      fail: () => {
        if (this.socketBuffer.length < 60) {
          this.socketBuffer.push(frameBuffer);
        }
      },
    });
  },

  sendEnd() {
    if (this.socket) {
      try {
        this.socket.send({ data: JSON.stringify({ type: "end" }) });
      } catch (error) {
        // 忽略
      }
    }
  },

  saveFinal(message) {
    const startSeconds = Math.max(0, (message.start_ms || 0) / 1000);
    const endSeconds = Math.max(startSeconds, (message.end_ms || 0) / 1000);
    api
      .addTranscriptSegment(this.sessionId, {
        text: message.text,
        start_seconds: startSeconds,
        end_seconds: endSeconds,
        speaker: message.speaker || undefined,
        source: "realtime",
        status: "final",
      })
      .then((segment) =>
        this.setData({ finals: this.data.finals.concat([segment]) }),
      )
      .catch((error) => this.setData({ speechHint: `字幕保存失败：${error.message}` }));
  },

  /* ---------------- 标记 ---------------- */

  selectMarkType(event) {
    this.setData({ markType: event.currentTarget.dataset.value });
  },

  onMarkInput(event) {
    this.setData({ markText: event.detail.value });
  },

  addMark() {
    if (!this.data.markText.trim()) {
      wx.showToast({ title: "先写点内容", icon: "none" });
      return;
    }
    api
      .addHighlight(this.sessionId, {
        type: this.data.markType,
        content: this.data.markText.trim(),
        timestamp_seconds: Math.round(this.elapsedSeconds()),
      })
      .then((highlight) => {
        this.setData({
          highlights: this.data.highlights.concat([highlight]),
          markText: "",
        });
        wx.showToast({ title: "已标记", icon: "success" });
      })
      .catch((error) => wx.showToast({ title: error.message, icon: "none" }));
  },

  /* ---------------- 停止后的上传与合并 ---------------- */

  /** 把当前累积的 PCM 帧写成一个 WAV 并上传；失败会把帧放回去，下次重试。 */
  flushChunk(final) {
    if (this.flushing || this.chunkFrames.length === 0) {
      return Promise.resolve();
    }
    this.flushing = true;
    const frames = this.chunkFrames;
    this.chunkFrames = [];
    const index = this.chunkIndex;
    const startSeconds = this.chunkStartSeconds;
    const endSeconds = Math.max(this.elapsedSeconds(), startSeconds + 0.5);
    const filePath = `${wx.env.USER_DATA_PATH}/chunk-${index}-${Date.now()}.wav`;

    const release = () => {
      this.flushing = false;
    };

    try {
      audio.writeWavFile(frames, filePath, SAMPLE_RATE);
    } catch (error) {
      this.chunkFrames = frames.concat(this.chunkFrames);
      release();
      this.setData({ error: `本地写入失败：${error.message}` });
      return Promise.reject(error);
    }

    return api
      .uploadChunkFile({
        sessionId: this.sessionId,
        filePath,
        formData: {
          chunk_id: `mp-${index}-${Date.now()}`,
          chunk_index: index,
          start_offset_seconds: Math.round(startSeconds),
          end_offset_seconds: Math.round(endSeconds),
        },
      })
      .then(() => {
        this.chunkIndex = index + 1;
        this.chunkStartSeconds = endSeconds;
        this.setData({
          uploadedChunks: index + 1,
          notice: `已上传 ${index + 1} 段录音`,
        });
        if (final) {
          this.setData({ notice: "录音已全部上传，正在合并…" });
        }
      })
      .catch((error) => {
        // 上传失败：把这一段的帧放回去，下一次 flush 会带着它一起重试
        this.chunkFrames = frames.concat(this.chunkFrames);
        this.setData({
          error: `第 ${index + 1} 段上传失败（会在下次重试）：${error.message}`,
        });
        throw error;
      })
      .then(
        (value) => {
          release();
          try {
            wx.getFileSystemManager().unlinkSync(filePath);
          } catch (error) {
            // 忽略清理失败
          }
          return value;
        },
        (error) => {
          release();
          try {
            wx.getFileSystemManager().unlinkSync(filePath);
          } catch (cleanupError) {
            // 忽略清理失败
          }
          throw error;
        },
      );
  },

  finishRecording() {
    this.clearTimer();
    this.closeSocket();
    this.setData({ uploading: true, notice: "正在上传最后一段录音…" });

    this.flushChunk(true)
      .then(() => {
        if (this.chunkIndex === 0) {
          throw new Error("没有录到音频数据");
        }
        return api.finalizeSession(this.sessionId, true);
      })
      .then(() => {
        this.setData({ phase: "done", uploading: false, notice: "录音已保存并合并完成" });
        this.loadSession();
        // 顺手把这次课堂记录存一份到云数据库（自建域名模式跳过）
        clouddb
          .saveSessionSnapshot({
            backendSessionId: this.sessionId,
            session: this.data.session,
            durationSeconds: Math.round(this.elapsedSeconds()),
            transcript: this.data.finals,
            highlights: this.data.highlights,
          })
          .catch(() => undefined);
      })
      .catch((error) => {
        this.setData({
          phase: "error",
          uploading: false,
          error: `上传或合并失败：${error.message}`,
        });
      });
  },

  openDetail() {
    wx.navigateTo({ url: `/pages/detail/detail?id=${this.sessionId}` });
  },
});
