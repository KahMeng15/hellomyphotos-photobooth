FROM node:20-alpine AS builder

WORKDIR /app
RUN apk add --no-cache curl python3 make g++
COPY shared ./shared
COPY photobooth-share ./photobooth-share

WORKDIR /app/shared
RUN npm ci

WORKDIR /app/photobooth-share
RUN npm ci
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/photobooth-share/package*.json ./photobooth-share/
WORKDIR /app/photobooth-share
RUN npm ci --omit=dev

COPY --from=builder /app/photobooth-share/dist ./dist
COPY --from=builder /app/photobooth-share/public ./public

EXPOSE 3001
CMD ["node", "dist/src/server.js"]
