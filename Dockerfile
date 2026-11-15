# Self-hosted alternative to AWS Lambda: serves the skill over HTTP on port
# 3000 (put a TLS-terminating proxy or tunnel in front). See README.md.
FROM node:24-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY lambda/package.json lambda/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY lambda/index.js lambda/server.js ./
COPY lambda/lib ./lib

USER node
EXPOSE 3000
HEALTHCHECK --interval=60s --timeout=5s \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "server.js"]
