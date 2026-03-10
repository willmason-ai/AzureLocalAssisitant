# Stage 1: Build React frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Production Python backend + serve frontend static files
FROM python:3.12-slim AS production

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libkrb5-dev \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ ./backend/
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

RUN mkdir -p /app/data/conversations

RUN useradd -m -s /bin/bash appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 3000

CMD ["gunicorn", \
     "--bind", "0.0.0.0:3000", \
     "--workers", "4", \
     "--worker-class", "gevent", \
     "--timeout", "300", \
     "--keep-alive", "65", \
     "backend.wsgi:app"]
