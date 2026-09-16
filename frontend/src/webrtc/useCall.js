import { useCallback, useEffect, useRef, useState } from "react";
import Peer from "peerjs";
import { AudioMixer } from "./AudioMixer";
import { buildIceServers } from "../config";

/**
 * useCall
 * -------
 * Wraps PeerJS (WebRTC signaling + STUN/TURN via its underlying
 * RTCPeerConnection) and an AudioMixer. Call flow:
 *
 *  1. init(): getUserMedia -> AudioMixer wired to the mic -> Peer created.
 *  2. callPeer(id) / incoming "call" event: the call starts with the RAW
 *     local stream (mic + camera), so the very first frames go through
 *     immediately without waiting on the mixer.
 *  3. Once the underlying RTCPeerConnection reaches "connected", the
 *     audio RTCRtpSender's track is swapped via replaceTrack() for the
 *     AudioMixer's output track — from then on, mic + every TTS source
 *     the mixer plays all travel to the remote peer on that one track.
 */
export function useCall() {
  const [status, setStatus] = useState("idle"); // idle | initializing | ready | calling | in-call | error
  const [error, setError] = useState(null);
  const [myPeerId, setMyPeerId] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [localStreamVersion, setLocalStreamVersion] = useState(0);
  const [micMuted, setMicMuted] = useState(false);
  const [usingMixedTrack, setUsingMixedTrack] = useState(false);

  const peerRef = useRef(null);
  const callRef = useRef(null);
  const localStreamRef = useRef(null);
  const mixerRef = useRef(null);

  const swapToMixedTrack = useCallback((call) => {
    const pc = call?.peerConnection;
    const mixedTrack = mixerRef.current?.getOutputAudioTrack();
    if (!pc || !mixedTrack) return;
    const sender = pc.getSenders().find((s) => s.track && s.track.kind === "audio");
    if (!sender) return;
    sender
      .replaceTrack(mixedTrack)
      .then(() => setUsingMixedTrack(true))
      .catch((err) => setError(err.message || String(err)));
  }, []);

  const wireCall = useCallback(
    (call) => {
      callRef.current = call;

      call.on("stream", (stream) => {
        setRemoteStream(stream);
        setStatus("in-call");
      });

      call.on("close", () => {
        setStatus("ready");
        setRemoteStream(null);
        setUsingMixedTrack(false);
      });

      call.on("error", (err) => {
        setError(err.message || String(err));
      });

      const pc = call.peerConnection;
      if (pc) {
        if (pc.connectionState === "connected") {
          swapToMixedTrack(call);
        } else {
          const onStateChange = () => {
            if (pc.connectionState === "connected") {
              swapToMixedTrack(call);
              pc.removeEventListener("connectionstatechange", onStateChange);
            }
          };
          pc.addEventListener("connectionstatechange", onStateChange);
        }
      }
    },
    [swapToMixedTrack]
  );

  const init = useCallback(async () => {
    setStatus("initializing");
    setError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera and microphone require HTTPS. Open the HTTPS URL.");
      }

      const localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      localStreamRef.current = localStream;
      setLocalStreamVersion((v) => v + 1);

      const mixer = new AudioMixer();
      await mixer.resume();
      mixer.connectMicrophone(localStream);
      mixerRef.current = mixer;

      const peer = new Peer(undefined, { config: { iceServers: buildIceServers() } });
      peerRef.current = peer;

      peer.on("open", (id) => {
        setMyPeerId(id);
        setStatus("ready");
      });

      peer.on("error", (err) => {
        setError(err.message || String(err));
        setStatus("error");
      });

      peer.on("call", (incomingCall) => {
        incomingCall.answer(localStreamRef.current);
        wireCall(incomingCall);
      });
    } catch (err) {
      setError(err.message || String(err));
      setStatus("error");
    }
  }, [wireCall]);

  const callPeer = useCallback(
    (remotePeerId) => {
      if (!peerRef.current || !localStreamRef.current) return;
      setStatus("calling");
      const call = peerRef.current.call(remotePeerId, localStreamRef.current);
      wireCall(call);
    },
    [wireCall]
  );

  const hangUp = useCallback(() => {
    callRef.current?.close();
    callRef.current = null;
    setStatus("ready");
    setRemoteStream(null);
    setUsingMixedTrack(false);
  }, []);

  const toggleMic = useCallback(() => {
    setMicMuted((prev) => {
      const next = !prev;
      mixerRef.current?.setMicMuted(next);
      return next;
    });
  }, []);

  /**
   * Play TTS audio (an ArrayBuffer from POST /api/tts) through the mixer.
   * Works identically whether the text came from typing, translation, an
   * AI reply, or (later) the gaze keyboard — same pipeline every time.
   */
  const speak = useCallback(async (arrayBuffer) => {
    if (!mixerRef.current) {
      throw new Error("Call the mic/camera before speaking (mixer not ready).");
    }
    await mixerRef.current.resume();
    return mixerRef.current.enqueueTTS(arrayBuffer);
  }, []);

  useEffect(() => {
    return () => {
      callRef.current?.close();
      peerRef.current?.destroy();
      mixerRef.current?.close();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return {
    status,
    error,
    myPeerId,
    remoteStream,
    micMuted,
    usingMixedTrack,
    localStream: localStreamRef.current,
    localStreamVersion, // bump signals "localStreamRef.current changed"
    init,
    callPeer,
    hangUp,
    toggleMic,
    speak,
  };
}
