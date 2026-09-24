import type { RecordingChunk } from "@/lib/types";

const DB_NAME = "classroom-listener-audio";
const DB_VERSION = 1;
const CHUNK_STORE = "chunks";
const AUDIO_STORE = "audio";

interface StoredChunk extends RecordingChunk {
  blob: Blob;
  mime_type: string;
}

interface ChunkRecord {
  session_id: string;
  items: StoredChunk[];
}

export interface LocalAudio {
  blob: Blob;
  mimeType: string;
  duration: number;
}

export interface LocalAudioChunkBlob {
  blob: Blob;
  mimeType: string;
  startSeconds: number;
  endSeconds: number;
  chunkIndex: number;
}

const memoryChunks = new Map<string, StoredChunk[]>();
const memoryAudio = new Map<string, LocalAudio>();
let databasePromise: Promise<IDBDatabase> | null = null;

function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) {
    return databasePromise;
  }
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CHUNK_STORE)) {
        db.createObjectStore(CHUNK_STORE, { keyPath: "session_id" });
      }
      if (!db.objectStoreNames.contains(AUDIO_STORE)) {
        db.createObjectStore(AUDIO_STORE, { keyPath: "session_id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法打开录音本地数据库"));
  });
  return databasePromise;
}

async function readChunkRecord(sessionId: string): Promise<ChunkRecord> {
  if (!hasIndexedDb()) {
    return { session_id: sessionId, items: memoryChunks.get(sessionId) ?? [] };
  }
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CHUNK_STORE, "readonly");
    const request = transaction.objectStore(CHUNK_STORE).get(sessionId);
    request.onsuccess = () => {
      resolve((request.result as ChunkRecord | undefined) ?? { session_id: sessionId, items: [] });
    };
    request.onerror = () => reject(request.error ?? new Error("读取录音分片失败"));
  });
}

async function writeChunkRecord(record: ChunkRecord): Promise<void> {
  if (!hasIndexedDb()) {
    memoryChunks.set(record.session_id, record.items);
    return;
  }
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CHUNK_STORE, "readwrite");
    transaction.objectStore(CHUNK_STORE).put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("保存录音分片失败"));
  });
}

async function readAudio(sessionId: string): Promise<LocalAudio | null> {
  if (!hasIndexedDb()) {
    return memoryAudio.get(sessionId) ?? null;
  }
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(AUDIO_STORE, "readonly");
    const request = transaction.objectStore(AUDIO_STORE).get(sessionId);
    request.onsuccess = () => {
      const value = request.result as (LocalAudio & { session_id: string }) | undefined;
      resolve(value ? { blob: value.blob, mimeType: value.mimeType, duration: value.duration } : null);
    };
    request.onerror = () => reject(request.error ?? new Error("读取录音失败"));
  });
}

async function writeAudio(sessionId: string, audio: LocalAudio): Promise<void> {
  if (!hasIndexedDb()) {
    memoryAudio.set(sessionId, audio);
    return;
  }
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(AUDIO_STORE, "readwrite");
    transaction.objectStore(AUDIO_STORE).put({ session_id: sessionId, ...audio });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("保存录音失败"));
  });
}

export async function saveLocalAudioChunk(
  sessionId: string,
  payload: {
    chunkId: string;
    chunkIndex: number;
    startOffsetSeconds: number;
    endOffsetSeconds: number;
    blob: Blob;
  },
): Promise<RecordingChunk> {
  const record = await readChunkRecord(sessionId);
  const stored: StoredChunk = {
    id: payload.chunkId,
    session_id: sessionId,
    chunk_id: payload.chunkId,
    chunk_index: payload.chunkIndex,
    start_offset_seconds: payload.startOffsetSeconds,
    end_offset_seconds: payload.endOffsetSeconds,
    size_bytes: payload.blob.size,
    sha256: "",
    created_at: new Date().toISOString(),
    blob: payload.blob,
    mime_type: payload.blob.type || "audio/webm",
  };
  record.items = record.items
    .filter((item) => item.chunk_id !== payload.chunkId)
    .concat(stored)
    .sort((a, b) => a.chunk_index - b.chunk_index);
  await writeChunkRecord(record);
  return {
    id: stored.id,
    session_id: stored.session_id,
    chunk_id: stored.chunk_id,
    chunk_index: stored.chunk_index,
    start_offset_seconds: stored.start_offset_seconds,
    end_offset_seconds: stored.end_offset_seconds,
    size_bytes: stored.size_bytes,
    sha256: stored.sha256,
    created_at: stored.created_at,
  };
}

export async function listLocalAudioChunks(sessionId: string): Promise<RecordingChunk[]> {
  const record = await readChunkRecord(sessionId);
  return record.items
    .sort((a, b) => a.chunk_index - b.chunk_index)
    .map((item) => ({
      id: item.id,
      session_id: item.session_id,
      chunk_id: item.chunk_id,
      chunk_index: item.chunk_index,
      start_offset_seconds: item.start_offset_seconds,
      end_offset_seconds: item.end_offset_seconds,
      size_bytes: item.size_bytes,
      sha256: item.sha256,
      created_at: item.created_at,
    }));
}

export async function mergeLocalAudioChunks(sessionId: string): Promise<LocalAudio> {
  const record = await readChunkRecord(sessionId);
  if (record.items.length === 0) {
    throw new Error("没有可合并的录音分片。");
  }
  const ordered = record.items.sort((a, b) => a.chunk_index - b.chunk_index);
  const mimeType = ordered.find((item) => item.mime_type)?.mime_type || "audio/webm";
  const blob = new Blob(
    ordered.map((item) => item.blob),
    { type: mimeType },
  );
  const duration = Math.max(
    ...ordered.map((item) => item.end_offset_seconds),
    0,
  );
  const audio = { blob, mimeType, duration };
  await writeAudio(sessionId, audio);
  return audio;
}

export async function getLocalAudioChunksWithBlobs(
  sessionId: string,
): Promise<LocalAudioChunkBlob[]> {
  const record = await readChunkRecord(sessionId);
  return record.items
    .sort((a, b) => a.chunk_index - b.chunk_index)
    .map((item) => ({
      blob: item.blob,
      mimeType: item.mime_type,
      startSeconds: item.start_offset_seconds,
      endSeconds: item.end_offset_seconds,
      chunkIndex: item.chunk_index,
    }));
}

export async function clearLocalAudioChunks(sessionId: string): Promise<void> {
  if (!hasIndexedDb()) {
    memoryChunks.delete(sessionId);
    return;
  }
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CHUNK_STORE, "readwrite");
    transaction.objectStore(CHUNK_STORE).delete(sessionId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("清理录音分片失败"));
  });
}

export async function getLocalAudio(sessionId: string): Promise<LocalAudio | null> {
  return readAudio(sessionId);
}
