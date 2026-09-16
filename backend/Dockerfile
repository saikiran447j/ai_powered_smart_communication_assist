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

# Ensure model path exists. If the model folder is already present in the
# repository it will be used. Otherwise attempt to download the common
# en_US-lessac-medium model from the rhasspy/piper-checkpoints dataset on
# Hugging Face. (Public dataset; adjust if you prefer a different model.)
RUN mkdir -p /app/models/piper/en_US-lessac-medium || true

# Download Piper Linux binary (x86_64) from rhasspy GitHub releases and
# extract to /opt/piper. This is a reproducible, pinned release.
RUN set -eux; \
    PIPER_URL=https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz; \
    mkdir -p /opt/piper; \
    wget -q -O /tmp/piper.tar.gz "$PIPER_URL" && \
    tar -xzf /tmp/piper.tar.gz -C /opt/piper --strip-components=0 || true && \
    rm -f /tmp/piper.tar.gz || true

# Attempt to download model files if they are not present in the repo.
# These URLs point to the public rhasspy/piper-checkpoints dataset on Hugging Face.
RUN set -eux; \
    MODEL_DIR=/app/models/piper/en_US-lessac-medium; \
    if [ -d "$MODEL_DIR" ] && [ -n "$(ls -A "$MODEL_DIR")" ]; then \
        echo "Model already present in repo, skipping download"; \
    else \
        mkdir -p "$MODEL_DIR"; \
        wget -q -O "$MODEL_DIR/en_US-lessac-medium.onnx" "https://huggingface.co/rhasspy/piper-checkpoints/resolve/main/en_US-lessac-medium/en_US-lessac-medium.onnx" || true; \
        wget -q -O "$MODEL_DIR/en_US-lessac-medium.onnx.json" "https://huggingface.co/rhasspy/piper-checkpoints/resolve/main/en_US-lessac-medium/en_US-lessac-medium.onnx.json" || true; \
        echo "Downloaded model artifacts (if available)."; \
    fi

# Ensure Piper binary is executable and on PATH
RUN if [ -f /opt/piper/piper ]; then chmod +x /opt/piper/piper; fi
ENV PATH="/opt/piper:${PATH}"

# Default Piper env vars used by the application. Render will provide $PORT
ENV PIPER_EXECUTABLE=/opt/piper/piper
ENV PIPER_MODEL_PATH=/app/models/piper/en_US-lessac-medium

# Expose the port used by Render via the $PORT env var at runtime
EXPOSE 8000

# Start the FastAPI app. Render sets $PORT in the environment; uvicorn
# will use it if present. Fall back to 8000 for local testing inside
# containers.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
