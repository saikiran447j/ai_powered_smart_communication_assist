/**
 * AudioMixer
 * ----------
 * The single mixing point for every audio source this app produces:
 * microphone, typed-text TTS, translated TTS, AI-reply TTS, and (later)
 * gaze-keyboard TTS. All of them route through here and out through one
 * MediaStreamAudioDestinationNode, whose track becomes the outgoing
 * WebRTC audio track (via RTCRtpSender.replaceTrack — see useCall.js).
 *
 * Feedback prevention: the microphone source connects ONLY to the mixer
 * destination (so the remote peer hears it), never to
 * audioContext.destination (the local speakers) — otherwise the user
 * would hear their own mic echoed back. Generated TTS sources, by
 * contrast, connect to BOTH the mixer destination (remote) and
 * audioContext.destination (local) per the spec: generated speech must be
 * locally audible AND remotely audible.
 */
export class AudioMixer {
  constructor() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      throw new Error("Web Audio API is not supported in this browser.");
    }
    this.audioContext = new Ctx();
    this.destination = this.audioContext.createMediaStreamDestination();

    this.micGain = this.audioContext.createGain();
    this.micGain.connect(this.destination);
    this._micSourceNode = null;

    this._ttsQueue = [];
    this._isPlayingTTS = false;
  }

  /** Resume the AudioContext — browsers require a user gesture first. */
  async resume() {
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
  }

  /** Connect (or reconnect) the microphone MediaStream into the mixer. */
  connectMicrophone(micStream) {
    if (this._micSourceNode) {
      this._micSourceNode.disconnect();
    }
    this._micSourceNode = this.audioContext.createMediaStreamSource(micStream);
    this._micSourceNode.connect(this.micGain);
  }

  setMicMuted(muted) {
    this.micGain.gain.setValueAtTime(muted ? 0 : 1, this.audioContext.currentTime);
  }

  /**
   * Decode and play a TTS audio buffer (from POST /api/tts) through the
   * mixer. Requests are queued and played one at a time so typed,
   * translated, AI, and gaze TTS never talk over each other or the mic.
   * Resolves when playback finishes.
   */
  enqueueTTS(arrayBuffer) {
    return new Promise((resolve, reject) => {
      this._ttsQueue.push({ arrayBuffer, resolve, reject });
      this._drainQueue();
    });
  }

  async _drainQueue() {
    if (this._isPlayingTTS || this._ttsQueue.length === 0) return;
    this._isPlayingTTS = true;
    const { arrayBuffer, resolve, reject } = this._ttsQueue.shift();
    try {
      // decodeAudioData detaches the buffer it's given, so pass a copy in
      // case the caller still holds a reference to the original.
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer.slice(0));
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.destination); // -> remote peer, via WebRTC
      source.connect(this.audioContext.destination); // -> local speakers
      source.onended = () => {
        this._isPlayingTTS = false;
        resolve();
        this._drainQueue();
      };
      source.start();
    } catch (err) {
      this._isPlayingTTS = false;
      reject(err);
      this._drainQueue();
    }
  }

  /** The mixed MediaStream — its audio track is what goes out over WebRTC. */
  getOutputStream() {
    return this.destination.stream;
  }

  getOutputAudioTrack() {
    return this.destination.stream.getAudioTracks()[0] || null;
  }

  close() {
    this._micSourceNode?.disconnect();
    this.micGain.disconnect();
    return this.audioContext.close();
  }
}
