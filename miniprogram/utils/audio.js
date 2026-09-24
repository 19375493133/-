// 小程序录音给的是 PCM 帧，这里负责：算音量（画波形）+ 拼成一个 WAV 文件上传。

/** 把 PCM16 ArrayBuffer 转成 Float32（-1 ~ 1），顺便算 RMS 当音量。 */
function analyseFrame(frameBuffer) {
  const view = new DataView(frameBuffer);
  const samples = Math.floor(view.byteLength / 2);
  let sum = 0;
  for (let i = 0; i < samples; i += 1) {
    const value = view.getInt16(i * 2, true) / 32768;
    sum += value * value;
  }
  const rms = samples > 0 ? Math.sqrt(sum / samples) : 0;
  return Math.min(100, Math.round(rms * 320));
}

function writeString(view, offset, text) {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

/**
 * 把多段 PCM16 帧拼成标准的 16kHz 单声道 WAV，写进小程序用户目录。
 * 后端会用 ffmpeg 把分片合并成 wav，所以这里给出合法 WAV 更稳妥。
 */
function writeWavFile(frames, filePath, sampleRate) {
  const rate = sampleRate || 16000;
  let dataLength = 0;
  frames.forEach((frame) => {
    dataLength += frame.byteLength;
  });

  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // PCM 头长度
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // 单声道
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true); // 字节率 = 采样率 * 声道 * 位深/8
  view.setUint16(32, 2, true); // 块对齐
  view.setUint16(34, 16, true); // 位深
  writeString(view, 36, "data");
  view.setUint32(40, dataLength, true);

  const bytes = new Uint8Array(buffer);
  let offset = 44;
  frames.forEach((frame) => {
    bytes.set(new Uint8Array(frame), offset);
    offset += frame.byteLength;
  });

  const fs = wx.getFileSystemManager();
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

function base64FromArrayBuffer(buffer) {
  return wx.arrayBufferToBase64(buffer);
}

function secondsToLabel(seconds) {
  const total = Math.max(0, Math.floor(seconds || 0));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

module.exports = {
  analyseFrame,
  writeWavFile,
  base64FromArrayBuffer,
  secondsToLabel,
};
