FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache curl python3 make g++

COPY shared ./shared
COPY photobooth-server/package*.json ./photobooth-server/

WORKDIR /app/shared
RUN npm ci

WORKDIR /app/photobooth-server
RUN npm ci

COPY photobooth-server ./
ARG VITE_SHARE_BASE_URL
ENV VITE_SHARE_BASE_URL=$VITE_SHARE_BASE_URL

RUN npm run build

FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache curl

COPY --from=builder /app/shared ./shared
COPY --from=builder /app/photobooth-server/package*.json ./photobooth-server/

WORKDIR /app/photobooth-server
RUN npm ci --omit=dev

COPY --from=builder /app/photobooth-server/dist ./dist
COPY --from=builder /app/photobooth-server/public ./public

RUN mkdir -p storage/{photos,frames,logs}

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["node", "dist/src/server.js"]
