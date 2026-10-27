FROM node:22.20.0-bookworm-slim@sha256:b21fe589dfbe5cc39365d0544b9be3f1f33f55f3c86c87a76ff65a02f8f5848e
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
COPY --from=qa configure-local.cjs /qa/configure-local.cjs
RUN node /qa/configure-local.cjs && npm run build && npm prune --omit=dev
COPY --from=qa bootstrap.cjs seed.sql /qa/
ENV NODE_ENV=test
EXPOSE 3000
CMD ["node", "/qa/bootstrap.cjs"]
