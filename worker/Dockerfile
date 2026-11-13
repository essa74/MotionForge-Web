FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-venv ffmpeg tini ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY worker.py ./

RUN useradd --create-home --uid 10001 worker \
    && mkdir -p /workspace /output \
    && chown -R worker:worker /workspace /output /app

USER worker
EXPOSE 8081
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["python3", "worker.py"]
