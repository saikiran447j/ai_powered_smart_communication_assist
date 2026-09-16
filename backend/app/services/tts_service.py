from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from typing import Tuple

from app.config import settings
from app.providers.exceptions import ProviderError


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

    text = text.strip()

    if len(text) > max_chars:
        raise ProviderError(
            f"Text exceeds maximum length of {max_chars} characters.", provider="piper"
        )

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

        # Piper accepts plain text on stdin for many builds; provide text
        # followed by newline.
        timeout_seconds = int(os.getenv("PIPER_TIMEOUT", "60"))

        result = subprocess.run(
            cmd,
            input=text + "\n",
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )

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

        with open(out_path, "rb") as audio_file:
            audio_data = audio_file.read()

        if not audio_data:
            raise ProviderError("Piper produced an empty WAV file.", provider="piper")

        # Basic WAV validation.
        if audio_data[:4] != b"RIFF" or audio_data[8:12] != b"WAVE":
            raise ProviderError("Piper output is not a valid WAV file.", provider="piper")

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