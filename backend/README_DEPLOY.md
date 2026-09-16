# Deployment Guide — Backend (Render)

This document explains how to deploy the backend to Render using the provided
`Dockerfile` and how Piper TTS is installed for production.

## Deployment Type
- Docker deployment on Render (Dockerfile at `backend/Dockerfile`).

## Dockerfile location
- backend/Dockerfile

## Build behavior
- Base image: `python:3.11-slim`
- Installs system dependencies needed for audio and the Piper binary.
- Installs Python dependencies from `backend/requirements.txt`.
- Downloads a pinned Piper Linux binary from the official rhasspy/piper
  releases: `https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz`.
- If the repo does not contain the model under
  `backend/models/piper/en_US-lessac-medium`, the Dockerfile will try to
  download the two primary artifacts from the public rhasspy/piper-checkpoints
  dataset on Hugging Face:
  - `en_US-lessac-medium.onnx`
  - `en_US-lessac-medium.onnx.json`

## Startup command
Render will set the `PORT` environment variable at runtime. The container
starts with:

uvicorn app.main:app --host 0.0.0.0 --port $PORT

(Implemented in the Dockerfile `CMD`.)

## Required environment variables (example keys)
- `PORT` (Render will provide this)
- `PIPER_EXECUTABLE` (defaults to `/opt/piper/piper` in the image)
- `PIPER_MODEL_PATH` (defaults to `/app/models/piper/en_US-lessac-medium`)
- `PIPER_VOICE` (e.g. `en_US-lessac-medium`)
- `CORS_ORIGINS` (comma-separated list of allowed origins; set to your Vercel URL)
- `STUN_URLS`, `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL` (optional)
- Provider API keys (e.g. `OPENAI_API_KEY`) — do NOT store these in source.

## Piper installation (production)
- The Dockerfile downloads the pinned Linux Piper release from GitHub
  releases. The binary is extracted to `/opt/piper` and the image adds
  `/opt/piper` to `PATH`.
- The application `settings.piper_executable` defaults to `piper` and will
  resolve to `/opt/piper/piper` in the container via `PATH` or the explicit
  `PIPER_EXECUTABLE` env var.

## Piper model installation (production)
- Prefer supplying the model in the repository at `backend/models/piper/...`
  (useful for testing). If not present, the Dockerfile attempts to download
  `en_US-lessac-medium.onnx` and the companion JSON metadata from
  `rhasspy/piper-checkpoints` on Hugging Face.
- The production model path inside the container is `/app/models/piper/en_US-lessac-medium`.

## Health check
- The backend exposes a `/health` endpoint (see `backend/app/api/routes/health.py`).
- Render health check should probe `/health` on the `PORT` used by the service.

## Notes and limitations
- The Dockerfile downloads artifacts from third-party sources (GitHub and
  Hugging Face). If your deployment environment restricts outbound access,
  provide the Piper binary and model via a private artifact store or include
  the model in the repo.
- The image makes a best-effort download of model files; validate the
  downloaded files in your CI or pre-deploy steps if needed.

## Testing (basic)
1. Deploy the Docker image to Render (private service).
2. Set `CORS_ORIGINS` to your frontend Vercel URL.
3. Visit the service `https://<render-service>`/health to confirm it's up.
4. Use a TTS request against `/api/tts` to confirm Piper is available and
   returns valid WAV audio.

