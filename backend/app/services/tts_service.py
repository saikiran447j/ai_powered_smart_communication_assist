from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import asyncio
import time
from typing import Tuple

from app.config import settings
from app.providers.exceptions import ProviderError

import logging

logger = logging.getLogger("app.services.tts")

# Semaphore to limit concurrent Piper jobs (process-wide). Keep at 1 for
# Render Free instance to avoid CPU overload.
_piper_semaphore = asyncio.Semaphore(1)


class PiperNotFoundError(ProviderError):
    status_code = 500


class PiperModelMissingError(ProviderError):
    status_code = 500


def _resolve_executable(path: str) -> str | None:
    """Resolve an executable path. If `path` is absolute, verify it exists.
    If `path` is a bare name, try to find it on PATH.
    Returns the resolved path or None if not found."""

    if os.path.isabs(path) or os.path.dirname(path):
        # Absolute or relative path provided
        if os.path.isfile(path) and os.access(path, os.X_OK):
            return path
        return None

    # Bare executable name; try PATH.
    found = shutil.which(path)
    return found


def _validate_model_path(model_path: str) -> str | None:
    """Validate the model path. Accepts either a model directory or a
    single model file (e.g. *.onnx). Returns the path to pass to Piper or
    None if missing."""

    if not model_path:
        return None

    # If it's a single file (onnx), accept it.
    if os.path.isfile(model_path):
        return model_path

    # If it's a directory, ensure it contains at least one .onnx file
    if os.path.isdir(model_path):
        for name in os.listdir(model_path):
            if name.lower().endswith(".onnx"):
                return model_path
        return None

    return None


def generate_speech_wav(
    text: str,
    voice: str | None = None,
    max_chars: int = 5000,
) -> Tuple[bytes, str]:
    """Generate WAV audio using the Piper CLI.

    This function works for both local Windows setups (absolute paths to
    a piper.exe) and Linux production deployments where `piper` is on
    PATH. The Piper model may be either a single file or a model
    directory (containing an .onnx and .onnx.json).
    """

    if not text or not text.strip():
        raise ProviderError("Empty text is not allowed for TTS.", provider="piper")

    piper_exe_conf = settings.piper_executable
    model_path_conf = settings.piper_model_path

    if not piper_exe_conf:
        raise PiperNotFoundError("Piper executable path is not configured.", provider="piper")

    piper_resolved = _resolve_executable(piper_exe_conf)
    if not piper_resolved:
        raise PiperNotFoundError(f"Piper executable not found: {piper_exe_conf}", provider="piper")

    model_resolved = _validate_model_path(model_path_conf)
    if not model_resolved:
        raise PiperModelMissingError(f"Piper model not found: {model_path_conf}", provider="piper")

    # Piper writes directly to this WAV file.
    fd, out_path = tempfile.mkstemp(suffix=".wav")
    os.close(fd)

    try:
        cmd = [
            piper_resolved,
            "--model",
            model_resolved,
            "--output_file",
            out_path,
        ]

        # Allow an optional voice override
        voice_to_use = voice or settings.piper_voice
        if voice_to_use:
            cmd.extend(["--voice", voice_to_use])

        timeout_seconds = int(os.getenv("PIPER_TIMEOUT", "60"))

        # Time the Piper subprocess separately from WAV processing
        piper_start = time.time()
        result = subprocess.run(
            cmd,
            input=text + "\n",
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )
        piper_end = time.time()
        piper_ms = int((piper_end - piper_start) * 1000)

        if result.returncode != 0:
            stderr = (result.stderr or "").strip()
            stdout = (result.stdout or "").strip()
            details = stderr or stdout or "Unknown Piper error."
            raise ProviderError(
                f"Piper CLI failed with exit code {result.returncode}: {details}",
                provider="piper",
            )

        if not os.path.isfile(out_path):
            raise ProviderError("Piper completed but did not create a WAV file.", provider="piper")

        wav_start = time.time()
        with open(out_path, "rb") as audio_file:
            audio_data = audio_file.read()
        wav_end = time.time()
        wav_ms = int((wav_end - wav_start) * 1000)

        if not audio_data:
            raise ProviderError("Piper produced an empty WAV file.", provider="piper")

        # Basic WAV validation.
        if audio_data[:4] != b"RIFF" or audio_data[8:12] != b"WAVE":
            raise ProviderError("Piper output is not a valid WAV file.", provider="piper")

        total_ms = int((time.time() - piper_start) * 1000)
        logger.info("TTS timings: piper=%dms wav=%dms total=%dms", piper_ms, wav_ms, total_ms)

        return audio_data, "audio/wav"

    except subprocess.TimeoutExpired as exc:
        raise ProviderError(f"Piper TTS timed out after {timeout_seconds} seconds.", provider="piper") from exc

    except FileNotFoundError as exc:
        raise PiperNotFoundError(f"Piper executable could not be started: {piper_resolved}", provider="piper") from exc

    finally:
        try:
            if os.path.exists(out_path):
                os.remove(out_path)
        except OSError:
            pass


async def generate_speech_wav_async(
    text: str,
    voice: str | None = None,
    max_chars: int = 5000,
) -> Tuple[bytes, str]:
    """Async wrapper that serializes Piper jobs via a semaphore and runs
    the blocking work in a threadpool so the FastAPI event loop isn't
    blocked. Returns the same (audio_bytes, content_type) tuple as the
    synchronous function.
    """
    start_total = time.time()
    wait_start = time.time()
    # Acquire semaphore to serialize Piper work
    await _piper_semaphore.acquire()
    wait_ms = int((time.time() - wait_start) * 1000)
    logger.info("TTS queue wait: %dms", wait_ms)
    try:
        # Log a clear start marker (do not log user text)
        logger.info("TTS started (queue_wait=%dms)", wait_ms)

        run_start = time.time()
        # Run the blocking generator in a separate thread to avoid blocking
        # the event loop. This reuses the synchronous implementation which
        # already handles timeouts and cleanup.
        result = await asyncio.to_thread(generate_speech_wav, text, voice, max_chars)
        run_ms = int((time.time() - run_start) * 1000)
        total_ms = int((time.time() - start_total) * 1000)
        # Log synthesis and total timings at INFO so they appear in Render logs
        logger.info("Piper synthesis: %dms", run_ms)
        logger.info("Total TTS: %dms", total_ms)
        # Clear finish marker
        logger.info("TTS finished (total=%dms)", total_ms)
        return result
    finally:
        _piper_semaphore.release()