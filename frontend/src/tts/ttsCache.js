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
  if (rec && rec.arrayBuffer) {
    console.debug("ttsCache: cache hit", key);
    return true;
  }
  return false;
}

export function isPending(text) {
  const key = normalize(text);
  const rec = cache.get(key);
  return !!(rec && rec.promise && !rec.arrayBuffer);
}

/**
 * Prefetch TTS for normalized `text`. Strictly ensures one in-flight
 * promise per text. Successful responses are cached, failures remove
 * the entry so callers may retry. Adds debug logs for timing analysis.
 */
export function prefetch(text, opts = {}) {
  const key = normalize(text);
  if (!key) return Promise.reject(new Error("Empty text"));

  const existing = cache.get(key);
  if (existing) {
    if (existing.arrayBuffer) {
      console.debug("ttsCache: returning cached audio for", key);
      return Promise.resolve(existing.arrayBuffer);
    }
    if (existing.promise) {
      console.debug("ttsCache: reusing in-flight request for", key);
      return existing.promise;
    }
  }

  console.debug("ttsCache: prefetch started for", key);
  const p = (async () => {
    try {
      console.debug("ttsCache: fetch start", key);
      const buf = await synthesizeSpeech(text, opts);
      console.debug("ttsCache: fetch completed", key, "bytes=", buf?.byteLength || 0);
      // store the ArrayBuffer
      cache.set(key, { arrayBuffer: buf });
      return buf;
    } catch (err) {
      // Do not cache failures. Remove any placeholder so retries can work.
      console.warn("ttsCache: fetch failed for", key, err);
      const rec = cache.get(key);
      if (rec && rec.promise) {
        cache.delete(key);
      }
      throw err;
    }
  })();

  // store the in-flight promise immediately
  cache.set(key, { promise: p });
  return p;
}

export async function getAudio(text, opts = {}) {
  const key = normalize(text);
  if (!key) throw new Error("Empty text");

  const rec = cache.get(key);
  if (rec) {
    if (rec.arrayBuffer) return rec.arrayBuffer;
    if (rec.promise) {
      console.debug("ttsCache: awaiting existing in-flight promise for", key);
      return await rec.promise;
    }
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
