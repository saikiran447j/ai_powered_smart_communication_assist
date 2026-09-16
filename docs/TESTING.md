# Backend Provider Layer — Local Verification

This can't be run inside the sandbox that built this repo (no network
access there). Run these on your own machine, where you have internet and
real API keys.

## 1. Install & start

```bash
cd backend
cp ../.env.example .env
# edit .env: set OPENAI_API_KEY and GOOGLE_TRANSLATE_API_KEY
pip install -r requirements.txt --break-system-packages   # omit the flag if not using system Python
uvicorn app.main:app --reload --port 8000
```

## 2. Health check — confirms config is loaded correctly

```bash
curl -s http://localhost:8000/api/health | python3 -m json.tool
```
Expect `credentials_configured.openai` and `.google_translate` to both be
`true` once your `.env` is filled in. If either is `false`, every call to
that provider will return a `MissingCredentialsError` (HTTP 500) with a
message telling you exactly which env var is missing — that's intentional,
not a bug.

## 3. TTS — the most important one to verify first

```bash
curl -s -X POST http://localhost:8000/api/tts \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, this is a test.", "voice": "alloy"}' \
  --output test.mp3

# Play it (macOS: afplay test.mp3 · Linux: mpv/ffplay test.mp3 · or just
# open test.mp3 in any player). If you hear real speech, the TTS provider
# is confirmed working end-to-end.
```

## 4. STT

```bash
curl -s -X POST http://localhost:8000/api/stt \
  -F "file=@test.mp3;type=audio/mpeg" \
  -F "language=en" | python3 -m json.tool
```
(Reusing the TTS output as STT input is a quick round-trip sanity check —
the transcribed text should roughly match what you asked TTS to say.)

## 5. Translation — all six required directions

```bash
for pair in "en hi" "hi en" "en te" "te en" "hi te" "te hi"; do
  set -- $pair
  echo "== $1 -> $2 =="
  curl -s -X POST http://localhost:8000/api/translate \
    -H "Content-Type: application/json" \
    -d "{\"text\": \"How are you today?\", \"source_language\": \"$1\", \"target_language\": \"$2\"}"
  echo
done
```

## 6. AI reply

```bash
curl -s -X POST http://localhost:8000/api/ai/reply \
  -H "Content-Type: application/json" \
  -d '{"message": "I need help asking for water."}' | python3 -m json.tool
```

## 7. Error-handling checks (do these deliberately — they should fail clearly, not silently)

- **Missing key**: comment out `OPENAI_API_KEY` in `.env`, restart, call `/api/tts` → expect HTTP 500, `error: "MissingCredentialsError"`.
- **Invalid key**: set `OPENAI_API_KEY=sk-invalid`, restart, call `/api/tts` → expect HTTP 502, `error: "InvalidCredentialsError"`.
- **Unsupported language**: call `/api/translate` with `"target_language": "fr"` → expect HTTP 400, `error: "UnsupportedLanguageError"`.
- **Empty text**: call `/api/tts` with `"text": ""` → expect HTTP 502, `error: "MalformedResponseError"`.

If all of the above pass, the provider layer (Phase 6/8/9/11 groundwork) is
confirmed.

---

# Frontend + WebRTC + Mixer — the critical end-to-end test

This is the test the whole project spec calls out as a gate: **do not trust
that remote TTS works until you've actually heard it on a second device.**

## 1. Start both halves on your machine

```bash
# Terminal 1 — backend (from repo root)
cd backend && cp ../.env.example .env   # fill in real keys first
pip install -r requirements.txt --break-system-packages
uvicorn app.main:app --reload --port 8000

# Terminal 2 — frontend (from repo root)
cd frontend
npm install
npm run dev -- --host
```

Vite will print a `Network:` URL (something like `http://192.168.x.x:5173`)
because `server.host: true` is set — that's what you'll open on the second
device. Both devices must be able to reach that IP (same Wi-Fi, or the
phone on mobile data if you're using a real TURN server — plain STUN alone
usually won't traverse two different networks; see the TURN note below).

## 2. Two-device call test

1. **Device A** (e.g. laptop): open `http://localhost:5173`, click **Start
   camera & microphone**, grant permissions. Note the displayed call ID.
2. **Device B** (e.g. phone, same Wi-Fi to start): open the `Network:` URL
   from step 1, click **Start camera & microphone**, grant permissions.
3. On Device B, enter Device A's call ID and click **Call**.
4. Confirm on both devices: you see the other person's video, and speaking
   into either microphone is heard on the other device. If this doesn't
   work, stop here — nothing past this point will either.
5. On Device A, type a sentence into the **Type a message to speak into
   the call** box and click **Speak**.
6. **Confirm on Device B that you hear the generated voice** — not text on
   screen, actual audio. Also confirm Device A hears its own generated
   speech locally (both are required by spec).
7. Repeat step 5–6 from Device B to A.

Only once both directions of both microphone audio AND generated TTS audio
are confirmed should translation, AI replies, or gaze features be trusted —
they all reuse this exact same mixer → WebRTC path, so if this works, they
inherit it "for free"; if it doesn't, nothing built on top of it will
either.

## 3. If the call connects but you don't hear yourself/each other

- Check the browser console on both devices for errors.
- Confirm the on-screen status line says "Connected — generated speech
  will be heard by the remote participant" (this flips only after
  `RTCRtpSender.replaceTrack()` succeeds — see `usingMixedTrack` in
  `useCall.js`). If it's stuck on "switching to the mixed audio track…",
  the peer connection likely never reached `"connected"`.
- Browser autoplay policies can block the local monitor path
  (`AudioMixer` → `audioContext.destination`) until a user gesture has
  happened on that tab — clicking "Start camera & microphone" counts, but
  if you still get silence, check for a "The AudioContext was not allowed
  to start" warning in the console.

## 4. STUN vs TURN

Plain STUN (the Google default in `.env.example`) works when both devices
are behind reasonably open NATs — same Wi-Fi network is the easy case. A
phone on mobile data behind carrier-grade NAT usually needs a real TURN
server to connect at all. If Device B is on mobile data and the call never
reaches "connected", set `TURN_URL` / `TURN_USERNAME` / `TURN_CREDENTIAL`
(and the matching `VITE_TURN_*` vars) to a real TURN provider (e.g.
Twilio's Network Traversal Service, Metered, or a self-hosted coturn) and
retry — this is expected, not a bug in the code.
