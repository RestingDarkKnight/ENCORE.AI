# Production Dockerfile for the ENCORE FastAPI backend.
# Works on Railway, Render, Fly.io, Cloud Run, or any Docker host.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# System deps (audio libs in case Whisper or future codecs need them)
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt /app/requirements.txt
#RUN pip install --upgrade pip && pip install -r /app/requirements.txt

COPY . /app

# Railway / Render / Fly will inject $PORT. Default to 8001 for local docker runs.
ENV PORT=8001
EXPOSE 8001

# Healthcheck endpoint (kept simple — Railway uses HTTP health on $PORT)
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/api/health" || exit 1

CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT}"]
