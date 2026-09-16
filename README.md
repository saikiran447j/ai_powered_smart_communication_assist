# AI Accessible Communication Assistant

A two-person WebRTC voice/video calling app with real-time TTS, STT, translation
(English ⇄ Hindi ⇄ Telugu), AI-generated replies, and a webcam gaze-controlled
keyboard for accessibility — built so every generated speech source (typed text,
translations, AI replies, gaze-typed text) is mixed with the microphone via the
Web Audio API and sent over the *same* outgoing WebRTC audio track, so the
remote participant hears everything.

This is a from-scratch build. No demo/mock functionality is included by design —
provider abstractions call real services, gated behind your own API keys.

## Status

See [`docs/PHASES.md`](docs/PHASES.md) for the live phase-by-phase build log —
what's implemented, what's verified, and what still needs your local machine,
devices, or API keys to confirm.

## Repo layout

```
frontend/   React + Vite client (WebRTC, audio mixer, gaze keyboard, UI)
backend/    FastAPI server (STT/TTS/translation/AI provider abstractions)
docs/       Architecture notes, phase log, testing guides
```

## Important: what this environment can and can't do

This project was built inside a sandboxed environment with **no outbound
network access** and no physical devices attached. That means:

- All code is written for real, no stubs pretending to be functional — but
  `npm install`, `pip install`, and running dev servers must happen **on your
  machine**, where there's network access.
- The "Device A (laptop/Wi-Fi) ↔ Device B (Android/mobile data)" call test
  described in the project spec must be run by you, following the checklist
  in `docs/TESTING.md` (added once Phase 4 — real WebRTC calling — lands).
- STT/TTS/translation/AI calls need your real API keys in `backend/.env`
  (copy from `.env.example`). Nothing will work end-to-end until those are set.

Every phase will tell you explicitly what was verified here (file structure,
imports, unit logic) vs. what you need to verify locally (network calls,
browser behavior, multi-device audio/video).

## Quick start

```bash
# Backend (terminal 1, from repo root)
cd backend
cp ../.env.example .env        # fill in OPENAI_API_KEY, GOOGLE_TRANSLATE_API_KEY
pip install -r requirements.txt --break-system-packages
uvicorn app.main:app --reload --port 8000

# Frontend (terminal 2, from repo root)
cd frontend
npm install
npm run dev -- --host          # --host exposes it on your LAN for a second device
```

Open the printed `Local:` URL on one device and the `Network:` URL on a
second device to test a real call — see `docs/TESTING.md` for the full
walkthrough, including the "can the remote side actually hear generated
speech" test that gates the rest of the project.

**Current state:** two-person video calling, microphone audio, and
typed-text → TTS → mixer → WebRTC are wired end-to-end but not yet
confirmed working (needs your machine + keys + a second device — see
`docs/PHASES.md`). Translation, AI replies, and gaze typing have working
backend providers but no UI controls yet.

## License

Unlicensed / private project (update as needed).
