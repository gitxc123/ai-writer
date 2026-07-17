# syntax=docker/dockerfile:1

FROM node:20-bookworm AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json frontend/.npmrc ./
RUN npm ci
COPY frontend/ ./
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN npm run build:h5

# --- backend runtime ---
FROM node:20-bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY backend/package.json backend/package-lock.json ./backend/
WORKDIR /app/backend
RUN npm ci --omit=dev

COPY backend/ ./
RUN npx prisma generate

# uni-app H5 output（若路径不同，构建日志里可确认）
COPY --from=frontend-build /app/frontend/dist/build/h5 ./public

ENV NODE_ENV=production
ENV PORT=3001
ENV DATA_DIR=/data
ENV UPLOAD_DIR=/data/uploads
ENV DATABASE_URL="file:/data/prod.db"
ENV STATIC_DIR=/app/backend/public

RUN mkdir -p /data/uploads

EXPOSE 3001
CMD ["node", "scripts/start-prod.js"]
