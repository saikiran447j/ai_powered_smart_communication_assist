# Production Dockerfile for Render (Linux)
# Builds a small image with Python backend and Piper TTS runtime.

FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1
WORKDIR /app

# Install OS deps needed for Piper binary and audio processing
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        wget \
        tar \
        libsndfile1 \
        libstdc++6 \
        libgcc-s1 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python deps
COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy the backend source
COPY . /app

# Ensure model path exists. We'll create the directory and download the
# en_US-lessac-medium model if it is not already present in the repo.
# The download step below is robust: wget is run with failure enabled and
# the JSON metadata is validated using Python so the Docker build will
# fail if files are missing or corrupted.

# Download Piper Linux binary (x86_64) from rhasspy GitHub releases and
# extract to /opt/piper. This is a reproducible, pinned release.
# Download Piper Linux binary (x86_64)
RUN set -eux; \
    PIPER_URL=https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz; \
    mkdir -p /opt/piper; \
    wget -q -O /tmp/piper.tar.gz "$PIPER_URL"; \
    tar -xzf /tmp/piper.tar.gz -C /opt/piper; \
    rm -f /tmp/piper.tar.gz; \
    PIPER_BIN="$(find /opt/piper -type f -name piper | head -n 1)"; \
    test -n "$PIPER_BIN"; \
    chmod +x "$PIPER_BIN"; \
    ln -sf "$PIPER_BIN" /usr/local/bin/piper; \
    /usr/local/bin/piper --help >/dev/null

# Attempt to download model files if they are not present in the repo.

# Attempt to download model files if they are not present in the repo.
# These URLs point to the public rhasspy/piper-checkpoints dataset on Hugging Face.
# Download and validate Piper model files
# Download and validate Piper model files
RUN set -eux; \
    MODEL_DIR=/app/models/piper/en_US-lessac-medium; \
    mkdir -p "$MODEL_DIR"; \
    echo "Downloading en_US-lessac-medium.onnx..."; \
    wget --tries=3 --timeout=30 -q -O "$MODEL_DIR/en_US-lessac-medium.onnx" \
        "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx"; \
    echo "Downloading en_US-lessac-medium.onnx.json..."; \
    wget --tries=3 --timeout=30 -q -O "$MODEL_DIR/en_US-lessac-medium.onnx.json" \
        "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json"; \
    test -s "$MODEL_DIR/en_US-lessac-medium.onnx"; \
    test -s "$MODEL_DIR/en_US-lessac-medium.onnx.json"; \
    python -c "import json; json.load(open('$MODEL_DIR/en_US-lessac-medium.onnx.json', encoding='utf-8'))"; \
    echo "Piper model and JSON metadata validated successfully"

# Ensure Piper binary is executable and on PATH
ENV PATH="/usr/local/bin:${PATH}"
ENV PIPER_EXECUTABLE=piper
ENV PIPER_MODEL_PATH=/app/models/piper/en_US-lessac-medium

# Expose the port used by Render via the $PORT env var at runtime
EXPOSE 8000

# Start the FastAPI app. Render sets $PORT in the environment; uvicorn
# will use it if present. Fall back to 8000 for local testing inside
# containers.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
