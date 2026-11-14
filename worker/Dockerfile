FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-venv ffmpeg tini ca-certificates \
    libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libgbm1 libasound2 \
    libxrandr2 libxkbcommon0 libxfixes3 libxcomposite1 libxdamage1 \
    libpango-1.0-0 libcairo2 libcups2 fonts-noto-core fonts-noto-color-emoji \
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
