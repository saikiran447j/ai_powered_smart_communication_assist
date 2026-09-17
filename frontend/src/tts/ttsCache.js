// Simple in-memory TTS cache & prefetch manager.
// Caches ArrayBuffer audio by normalized text and prevents duplicate
// simultaneous requests by storing the in-flight Promise.
import { synthesizeSpeech } from "../api/backend";

function normalize(text) {
  return (text || "").trim().replace(/\s+/g, " ");
}

const cache = new Map(); // key -> { arrayBuffer?: ArrayBuffer, promise?: Promise }

export function hasAudio(text) {
  const key = normalize(text);
  const rec = cache.get(key);
  return !!(rec && rec.arrayBuffer);
}

export function isPending(text) {
  const key = normalize(text);
  const rec = cache.get(key);
  return !!(rec && rec.promise && !rec.arrayBuffer);
}

export function prefetch(text, opts = {}) {
  const key = normalize(text);
  if (!key) return Promise.reject(new Error("Empty text"));

  const existing = cache.get(key);
  if (existing) {
    if (existing.arrayBuffer) return Promise.resolve(existing.arrayBuffer);
    if (existing.promise) return existing.promise;
  }

  const p = (async () => {
    try {
      const buf = await synthesizeSpeech(text, opts);
      // store the ArrayBuffer copy
      cache.set(key, { arrayBuffer: buf });
      return buf;
    } catch (err) {
      cache.delete(key);
      throw err;
    }
  })();

  cache.set(key, { promise: p });
  return p;
}

export async function getAudio(text, opts = {}) {
  const key = normalize(text);
  if (!key) throw new Error("Empty text");

  const rec = cache.get(key);
  if (rec) {
    if (rec.arrayBuffer) return rec.arrayBuffer;
    if (rec.promise) return await rec.promise;
  }

  // No cache entry — start a request and return it.
  return await prefetch(text, opts);
}

export default {
  normalize,
  hasAudio,
  isPending,
  prefetch,
  getAudio,
};
