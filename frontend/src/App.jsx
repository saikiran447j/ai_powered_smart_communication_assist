import { useEffect, useRef, useState } from "react";
import { useCall } from "./webrtc/useCall";
import ttsManager from "./tts/ttsCache";

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
  const [message, setMessage] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [speakError, setSpeakError] = useState(null);
  const [preparing, setPreparing] = useState(false);

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

  async function handleSpeak() {
    const text = message.trim();
    if (!text) return;
    setSpeakError(null);
    setSpeaking(true);
    try {
      const audioBytes = await ttsManager.getAudio(text);
      await speak(audioBytes);
    } catch (err) {
      setSpeakError(err.message);
    } finally {
      setSpeaking(false);
    }
  }
  // Prefetch TTS whenever text becomes available while in a call. This
  // starts the /api/tts request in the background so clicking Speak is fast.
  const inCall = status === "in-call";

  // Debounced prefetch: wait until user stops typing for ~500ms before
  // starting a background TTS request. This avoids many partial requests
  // and prevents stale/cancelled fetches from surfacing as visible errors.
  useEffect(() => {
    const txt = message.trim();
    if (!txt || !inCall) {
      setPreparing(false);
      return;
    }

    if (ttsManager.hasAudio(txt)) {
      setPreparing(false);
      return;
    }

    // Start a debounce timer; only when it fires do we call prefetch.
    setPreparing(true);
    const timer = setTimeout(() => {
      // If audio is already cached or pending, reuse it.
      if (ttsManager.hasAudio(txt)) {
        setPreparing(false);
        return;
      }

      if (ttsManager.isPending(txt)) {
        // There's an in-flight request for this exact text -> observe it.
        console.debug("App: observing existing in-flight prefetch for", txt);
        ttsManager.prefetch(txt).finally(() => {
          if (message.trim() === txt) setPreparing(false);
        });
        return;
      }

      // Start prefetching now.
      console.debug("App: debounced prefetch firing for", txt);
      ttsManager
        .prefetch(txt)
        .then(() => {
          if (message.trim() === txt) setPreparing(false);
        })
        .catch((err) => {
          // Ignore stale/cancelled prefetches; surface real errors only
          // when the user explicitly clicks Speak.
          console.debug("App: prefetch error (ignored) for", txt, err);
          if (message.trim() === txt) setPreparing(false);
        });
    }, 500);

    return () => {
      clearTimeout(timer);
      // Do not abort any in-flight fetch; just cancel the debounce timer.
    };
  }, [message, inCall]);

  return (
    <main className="app">
      <h1>AI Accessible Communication Assistant</h1>

      {status === "idle" && (
        <button onClick={init}>Start camera &amp; microphone</button>
      )}
      {status === "initializing" && <p aria-live="polite">Requesting camera and microphone…</p>}
      {status === "error" && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      {myPeerId && (
        <p>
          Your call ID: <code>{myPeerId}</code> — share this with the other participant so
          they can call you.
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
          <button disabled={!remoteId || status !== "ready"} onClick={() => callPeer(remoteId)}>
            Call
          </button>
          <button disabled={!inCall} onClick={hangUp}>
            Hang up
          </button>
          <button onClick={toggleMic} disabled={status === "idle" || status === "initializing"}>
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
        <video ref={localVideoRef} autoPlay playsInline muted aria-label="Your camera" />
        <video ref={remoteVideoRef} autoPlay playsInline aria-label="Remote participant" />
      </div>

      <section aria-label="Type to speak into the call">
        <label htmlFor="message">Type a message to speak into the call</label>
        <textarea
          id="message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          disabled={!inCall}
        />
        <button disabled={speaking || !inCall || !message.trim()} onClick={handleSpeak}>
          {speaking ? "Speaking…" : "Speak"}
        </button>
        {preparing && (
          <p aria-live="polite" className="preparing">
            Preparing voice...
          </p>
        )}
        {speakError && (
          <p role="alert" className="error">
            {speakError}
          </p>
        )}
      </section>
    </main>
  );
}
