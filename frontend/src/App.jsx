import { useEffect, useRef, useState } from "react";
import { useCall } from "./webrtc/useCall";
import { synthesizeSpeech } from "./api/backend";

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
      const audioBytes = await synthesizeSpeech(text);
      await speak(audioBytes);
    } catch (err) {
      setSpeakError(err.message);
    } finally {
      setSpeaking(false);
    }
  }

  const inCall = status === "in-call";

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
        {speakError && (
          <p role="alert" className="error">
            {speakError}
          </p>
        )}
      </section>
    </main>
  );
}
