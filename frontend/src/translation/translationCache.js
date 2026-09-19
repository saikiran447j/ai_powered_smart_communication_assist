// Simple in-memory translation cache & deduplication manager.
// Caches translated text by `${sourceLang}->${targetLang}:${normalizedText}`.
// Prevents duplicate simultaneous translation requests by sharing in-flight Promises.
// Never caches failed translations.

import { translateText } from "../api/backend.js";

function normalize(text) {
  return (text || "").trim().replace(/\s+/g, " ");
}

function makeKey(text, sourceLang, targetLang) {
  const norm = normalize(text);
  if (!norm) return "";
  return `${sourceLang || "en"}->${targetLang || "en"}:${norm}`;
}

const cache = new Map(); // key -> { translatedText?: string, promise?: Promise<string> }

export function hasTranslation(text, sourceLang, targetLang) {
  const key = makeKey(text, sourceLang, targetLang);
  if (!key) return false;
  const rec = cache.get(key);
  return Boolean(rec && rec.translatedText !== undefined);
}

export function isPending(text, sourceLang, targetLang) {
  const key = makeKey(text, sourceLang, targetLang);
  if (!key) return false;
  const rec = cache.get(key);
  return Boolean(rec && rec.promise && rec.translatedText === undefined);
}

export function getCached(text, sourceLang, targetLang) {
  const key = makeKey(text, sourceLang, targetLang);
  if (!key) return null;
  const rec = cache.get(key);
  return rec?.translatedText ?? null;
}

/**
 * Translate text with in-flight deduplication and memory caching.
 * If sourceLang === targetLang, returns input immediately without network call.
 * If a request with same text + sourceLang + targetLang is in-flight, reuses that promise.
 * Failures are never cached, allowing subsequent retry attempts.
 */
export function translate(text, sourceLang = "en", targetLang = "hi") {
  const norm = normalize(text);
  if (!norm) return Promise.resolve("");

  // Short-circuit identical language pair
  if (sourceLang === targetLang) {
    return Promise.resolve(norm);
  }

  const key = makeKey(norm, sourceLang, targetLang);
  const existing = cache.get(key);

  if (existing) {
    if (existing.translatedText !== undefined) {
      console.debug("translationCache: cache hit for", key);
      return Promise.resolve(existing.translatedText);
    }
    if (existing.promise) {
      console.debug("translationCache: reusing in-flight request for", key);
      return existing.promise;
    }
  }

  console.debug("translationCache: requesting translation for", key);

  const p = (async () => {
    try {
      const resp = await translateText(norm, sourceLang, targetLang);
      const translated = resp?.translated_text || "";
      console.debug("translationCache: translation succeeded for", key, "->", translated);
      cache.set(key, { translatedText: translated });
      return translated;
    } catch (err) {
      console.warn("translationCache: translation failed for", key, err.message || err);
      // Clean up in-flight entry so subsequent calls can retry; do NOT cache failure
      cache.delete(key);
      throw err;
    }
  })();

  // Store in-flight promise
  cache.set(key, { promise: p });
  return p;
}

export function clearCache() {
  cache.clear();
}

export default {
  normalize,
  makeKey,
  hasTranslation,
  isPending,
  getCached,
  translate,
  clearCache,
};
