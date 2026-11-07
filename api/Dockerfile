FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

# A named volume inherits this ownership the first time it's mounted.
RUN mkdir /data && chown node:node /data
USER node

ENV DATA_DIR=/data HOST=0.0.0.0 PORT=8787
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:8787/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

# Node runs directly, not through npm, so it receives the stop signal and can close the database.
CMD ["node", "--import", "tsx", "src/server.ts"]
