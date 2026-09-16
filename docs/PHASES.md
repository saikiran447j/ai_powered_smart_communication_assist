# Build Log — Phase Status

Legend: ✅ done & verified here · 🟡 code written, needs local/network/device verification · ⬜ not started

| # | Phase | Status | Notes |
|---|-------|--------|-------|
| 1 | Project foundation | ✅ | Repo structure, `.gitignore`, `.env.example`, README, this log |
| 2 | React + FastAPI scaffolding | 🟡 | Backend + frontend both scaffolded (FastAPI app; Vite/React app with PeerJS). Syntax-checked where tooling allows — see notes below |
| 3 | Health API | ✅ | `GET /api/health`, syntax-verified here |
| 4 | Real WebRTC two-device calling | 🟡 | PeerJS signaling + STUN/TURN config in `useCall.js`. Needs your two physical devices — see `docs/TESTING.md` |
| 5 | Web Audio mixer | 🟡 | `AudioMixer.js`: mic -> mixer only (no local echo), TTS -> mixer + local speakers, queued playback. Needs browser verification |
| 6 | Real TTS | 🟡 | `OpenAITTSProvider` (gpt-4o-mini-tts) written, real MP3 bytes returned. Needs your `OPENAI_API_KEY` to verify — see `docs/TESTING.md` |
| 7 | TTS → mixer → WebRTC | 🟡 | Typed-text path wired end-to-end: textarea -> `/api/tts` -> `AudioMixer.enqueueTTS` -> `RTCRtpSender.replaceTrack`. **Not yet confirmed working** — this is the critical test in `docs/TESTING.md`, run it before trusting anything past this row |
| 8 | STT | 🟡 | `OpenAISTTProvider` (gpt-4o-mini-transcribe) written, not yet wired into the UI (no record button yet). Needs your API key to verify |
| 9 | Translation | 🟡 | `GoogleTranslationProvider` (Translation API v2), all 6 en/hi/te directions, not yet wired into the UI. Needs your `GOOGLE_TRANSLATE_API_KEY` to verify |
| 10 | Translation TTS → WebRTC | ⬜ | Backend ready (9); no UI control yet to trigger it |
| 11 | AI assistant | 🟡 | `OpenAIProvider` via Responses API written, not yet wired into the UI. Needs your API key to verify |
| 12 | AI TTS → WebRTC | ⬜ | Backend ready (11); no UI control yet to trigger it |
| 13 | MediaPipe gaze | ⬜ | Needs webcam (browser only) |
| 14 | Gaze calibration | ⬜ | |
| 15 | Gaze keyboard | ⬜ | |
| 16 | Gaze → TTS → WebRTC | ⬜ | |
| 17 | Mobile optimization | ⬜ | |
| 18 | Error handling | ⬜ | |
| 19 | Testing | ⬜ | |
| 20 | Production build | ⬜ | |
| 21 | Deployment prep (Vercel + Render) | ⬜ | |

## Sandbox verification limits

The build environment has no outbound network access (confirmed: requests to
pypi.org are blocked) and no physical hardware. So "verified here" is limited to:

- File/module structure exists and imports resolve
- Python syntax/type checks where possible without installing deps
- Logic that doesn't require an external network call

Anything needing `pip`/`npm` installs, live API calls, camera/mic access, or a
second device is marked 🟡 and ships with an exact command/checklist for you
to run locally.

Node.js *is* available in the sandbox, so plain `.js` modules (`AudioMixer.js`,
`useCall.js`, `config.js`, `api/backend.js`) were syntax-checked with
`node --check`. `.jsx` files (`App.jsx`, `main.jsx`) use JSX syntax that
`node --check` can't parse and no offline bundler/Babel was available to
verify them — they were written carefully and reviewed by hand, but treat
them as 🟡 (needs `npm run dev` on your machine) rather than ✅ until you've
run them.
