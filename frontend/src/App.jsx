import { useCallback, useEffect, useRef, useState } from "react";
import { useCall } from "./webrtc/useCall";
import ttsManager from "./tts/ttsCache";
import translationManager from "./translation/translationCache";

const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English", sarvam: "en-IN" },
  { code: "hi", label: "Hindi", sarvam: "hi-IN" },
  { code: "bn", label: "Bengali", sarvam: "bn-IN" },
  { code: "ta", label: "Tamil", sarvam: "ta-IN" },
  { code: "te", label: "Telugu", sarvam: "te-IN" },
  { code: "gu", label: "Gujarati", sarvam: "gu-IN" },
  { code: "kn", label: "Kannada", sarvam: "kn-IN" },
  { code: "ml", label: "Malayalam", sarvam: "ml-IN" },
  { code: "mr", label: "Marathi", sarvam: "mr-IN" },
  { code: "pa", label: "Punjabi", sarvam: "pa-IN" },
  { code: "or", label: "Odia", sarvam: "or-IN" },
];

// Backend translation currently supports only these language codes.
const SUPPORTED_TRANSLATION = ["en", "hi", "bn", "ta", "te", "gu", "kn", "ml", "mr", "pa", "or"];

export default function App() {
  const {
    status,
    error,
    myPeerId,
    remoteStream,
    micMuted,
    usingMixedTrack,
    localStream,
    localStreamVersion,
    init,
    callPeer,
    hangUp,
    toggleMic,
    speak,
  } = useCall();

  const [remoteId, setRemoteId] = useState("");
  const [sourceLang, setSourceLang] = useState("en");
  const [targetLang, setTargetLang] = useState("hi");
  const [message, setMessage] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [translating, setTranslating] = useState(false);
  const [translationError, setTranslationError] = useState(null);
  const [speaking, setSpeaking] = useState(false);
  const [speakError, setSpeakError] = useState(null);
  const [preparing, setPreparing] = useState(false);
  const [speaker, setSpeaker] = useState("default");
  const [pace, setPace] = useState(1.0);
  const [temperature, setTemperature] = useState(0.5);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, localStreamVersion]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const inCall = status === "in-call";

  // Helper to resolve language label by code
  const getLangLabel = (code) =>
    SUPPORTED_LANGUAGES.find((l) => l.code === code)?.label || code;

  // Execute translation via the translation cache manager (with deduplication)
  const executeTranslation = useCallback(async (text, src, tgt) => {
    const trimmed = (text || "").trim();
    if (!trimmed) {
      setTranslatedText("");
      setTranslationError(null);
      setTranslating(false);
      return "";
    }
    // If backend doesn't support this target language, skip translation
    if (!SUPPORTED_TRANSLATION.includes(tgt)) {
      setTranslatedText(trimmed);
      setTranslationError(null);
      setTranslating(false);
      return trimmed;
    }

    if (src === tgt) {
      setTranslatedText(trimmed);
      setTranslationError(null);
      setTranslating(false);
      return trimmed;
    }

    setTranslating(true);
    setTranslationError(null);
    try {
      const result = await translationManager.translate(trimmed, src, tgt);
      setTranslatedText(result);
      return result;
    } catch (err) {
      setTranslationError(err.message || String(err));
      throw err;
    } finally {
      setTranslating(false);
    }
  }, []);

  // Debounced translation: triggers 500ms after user pauses typing
  useEffect(() => {
    const trimmed = message.trim();
    if (!trimmed) {
      setTranslatedText("");
      setTranslationError(null);
      setTranslating(false);
      return;
    }

    if (sourceLang === targetLang) {
      setTranslatedText(trimmed);
      setTranslationError(null);
      setTranslating(false);
      return;
    }

    // Check if result is already in memory cache
    const cached = translationManager.getCached(trimmed, sourceLang, targetLang);
    if (cached !== null) {
      setTranslatedText(cached);
      setTranslationError(null);
      setTranslating(false);
      return;
    }

    setTranslating(true);
    const timer = setTimeout(() => {
      executeTranslation(trimmed, sourceLang, targetLang).catch((err) => {
        console.debug("App: debounced translation error (handled)", err);
      });
    }, 500);

    return () => clearTimeout(timer);
  }, [message, sourceLang, targetLang, executeTranslation]);

  // Source language selector handler
  const handleSourceChange = (e) => {
    const nextVal = e.target.value;
    setSourceLang(nextVal);
  };

  // Target language selector handler
  const handleTargetChange = (e) => {
    const nextVal = e.target.value;
    setTargetLang(nextVal);
  };

  // Swap source and target languages (and text if available)
  const handleSwap = () => {
    const prevSrc = sourceLang;
    const prevTgt = targetLang;
    setSourceLang(prevTgt);
    setTargetLang(prevSrc);

    // If we have a translated text, swap message with translated text
    if (translatedText && translatedText !== message) {
      const prevMsg = message;
      setMessage(translatedText);
      setTranslatedText(prevMsg);
    }
  };

  // Manual translate button handler
  const handleManualTranslate = () => {
    if (!message.trim()) return;
    executeTranslation(message, sourceLang, targetLang).catch(() => {});
  };

  // Debounced TTS prefetch: prefetch the text-to-be-spoken into TTS cache while in call
  useEffect(() => {
    const textToPrefetch =
      sourceLang === targetLang ? message.trim() : translatedText.trim();

    if (!textToPrefetch || !inCall) {
      setPreparing(false);
      return;
    }

    if (ttsManager.hasAudio(textToPrefetch, { language: targetLang, speaker, pace, temperature })) {
      setPreparing(false);
      return;
    }

    if (ttsManager.isPending(textToPrefetch, { language: targetLang, speaker, pace, temperature })) {
      setPreparing(true);
      ttsManager
        .prefetch(textToPrefetch, { language: targetLang, speaker, pace, temperature })
        .finally(() => setPreparing(false));
      return;
    }

    setPreparing(true);
    const timer = setTimeout(() => {
      ttsManager
        .prefetch(textToPrefetch, { language: targetLang, speaker, pace, temperature })
        .then(() => setPreparing(false))
        .catch((err) => {
          console.debug("App: prefetch error (ignored) for", textToPrefetch, err);
          setPreparing(false);
        });
    }, 400);

    return () => clearTimeout(timer);
  }, [message, translatedText, sourceLang, targetLang, inCall]);

  // Speak handler: speaks the translated text (or input if source == target)
  const handleSpeak = async () => {
    const rawInput = message.trim();
    if (!rawInput) return;

    setSpeakError(null);
    setSpeaking(true);

    try {
      let textToSpeak =
        sourceLang === targetLang ? rawInput : translatedText.trim();

      // If translation is not yet ready, perform it now before speaking
      if (!textToSpeak && sourceLang !== targetLang) {
        textToSpeak = await executeTranslation(rawInput, sourceLang, targetLang);
      }

      if (!textToSpeak) {
        textToSpeak = rawInput;
      }

      const audioBytes = await ttsManager.getAudio(textToSpeak, {
        language: targetLang,
        speaker,
        pace,
        temperature,
      });
      await speak(audioBytes);
    } catch (err) {
      setSpeakError(err.message || String(err));
    } finally {
      setSpeaking(false);
    }
  };

  return (
    <main className="app">
      <h1>AI Accessible Communication Assistant</h1>

      {status === "idle" && (
        <button onClick={init}>Start camera &amp; microphone</button>
      )}
      {status === "initializing" && (
        <p aria-live="polite">Requesting camera and microphone…</p>
      )}
      {status === "error" && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      {myPeerId && (
        <p>
          Your call ID: <code>{myPeerId}</code> — share this with the other
          participant so they can call you.
        </p>
      )}

      {(status === "ready" || status === "calling" || inCall) && (
        <div className="call-controls">
          <label htmlFor="remote-id" className="sr-only">
            Remote participant&apos;s call ID
          </label>
          <input
            id="remote-id"
            placeholder="Enter the other participant's call ID"
            value={remoteId}
            onChange={(e) => setRemoteId(e.target.value)}
            disabled={inCall}
          />
          <button
            disabled={!remoteId || status !== "ready"}
            onClick={() => callPeer(remoteId)}
          >
            Call
          </button>
          <button disabled={!inCall} onClick={hangUp}>
            Hang up
          </button>
          <button
            onClick={toggleMic}
            disabled={status === "idle" || status === "initializing"}
          >
            {micMuted ? "Unmute microphone" : "Mute microphone"}
          </button>
        </div>
      )}

      {inCall && (
        <p aria-live="polite" className="status-line">
          {usingMixedTrack
            ? "Connected — generated speech will be heard by the remote participant."
            : "Connected — switching to the mixed audio track…"}
        </p>
      )}

      <div className="video-grid">
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          aria-label="Your camera"
        />
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          aria-label="Remote participant"
        />
      </div>

      <section className="speech-section" aria-label="Type, translate, and speak into the call">
        {/* Language Selectors and Swap Button */}
        <div className="language-toolbar">
          <div className="lang-group">
            <label htmlFor="source-lang">Source:</label>
            <select
              id="source-lang"
              value={sourceLang}
              onChange={handleSourceChange}
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className="swap-btn"
            onClick={handleSwap}
            title="Swap source and target languages"
            aria-label="Swap source and target languages"
          >
            ⇄ Swap
          </button>

          <div className="lang-group">
            <label htmlFor="target-lang">Target:</label>
            <select
              id="target-lang"
              value={targetLang}
              onChange={handleTargetChange}
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Text Input */}
        <div>
          <label htmlFor="message" className="sr-only">
            Type message in {getLangLabel(sourceLang)}
          </label>
          <textarea
            id="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={`Type a message in ${getLangLabel(sourceLang)}…`}
            rows={3}
          />
        </div>

        {/* Translation Status and Output */}
        {translating && (
          <p aria-live="polite" className="translating">
            Translating ({getLangLabel(sourceLang)} → {getLangLabel(targetLang)})…
          </p>
        )}

        {translationError && (
          <p role="alert" className="error">
            Translation error: {translationError}
          </p>
        )}

        {translatedText && (
          <div className="translation-result-box" aria-live="polite">
            <span className="direction-badge">
              {getLangLabel(sourceLang)} → {getLangLabel(targetLang)}
            </span>
            <p className="translated-text">{translatedText}</p>
          </div>
        )}

        {/* Voice model limitation notice when non-English target language is chosen */}
        {targetLang !== "en" && (
          <p className="voice-note" role="note">
            Voice note: Translation is active. Speech output currently uses the
            English voice model (en_US-lessac-medium) until native {getLangLabel(targetLang)} voice models are installed.
          </p>
        )}

        {/* Action buttons */}
        <div className="action-row">
          <button
            type="button"
            className="secondary-btn"
            disabled={translating || !message.trim()}
            onClick={handleManualTranslate}
          >
            Translate
          </button>

          <button
            type="button"
            disabled={
              speaking ||
              !message.trim() ||
              (sourceLang !== targetLang && !translatedText && !translating)
            }
            onClick={handleSpeak}
          >
            {speaking ? "Speaking…" : "Speak"}
          </button>

          {preparing && (
            <span aria-live="polite" className="preparing">
              Preparing voice…
            </span>
          )}
        </div>

        {speakError && (
          <p role="alert" className="error">
            {speakError}
          </p>
        )}
        <div className="voice-controls">
          <label htmlFor="speaker">Speaker:</label>
          <select id="speaker" value={speaker} onChange={(e) => setSpeaker(e.target.value)}>
            <option value="default">Default</option>
            <option value="bulbul_male">Bulbul (Male)</option>
            <option value="bulbul_female">Bulbul (Female)</option>
            <option value="bulbul_neutral">Bulbul (Neutral)</option>
          </select>

          <label htmlFor="pace">Pace: {pace}</label>
          <input id="pace" type="range" min="0.5" max="2.0" step="0.1" value={pace} onChange={(e) => setPace(Number(e.target.value))} />

          <label htmlFor="temperature">Temperature: {temperature}</label>
          <input id="temperature" type="range" min="0.01" max="1.0" step="0.01" value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} />
        </div>
      </section>
    </main>
  );
}
