# Stampd backend image — production (G15).
# Render's native Node buildpack remains the production deployment path;
# this image exists for local parity, staging replicas, and disaster
# recovery ("redeploy anywhere in 5 minutes"). The pinned digest is fetched
# from the registry (`docs/scripts/check-base-image.sh` refreshes it);
# bumping the base tag requires re-pinning.

FROM node:22.16.0-slim@sha256:048ed02c5fd52e86fda6fbd2f6a76cf0d4492fd6c6fee9e2c463ed5108da0e34 AS base

# Non-root user — the container cannot accidentally rewrite its own layers.
RUN addgroup --system app && adduser --system --ingroup app app

FROM base AS deps
WORKDIR /app/backend
COPY package.json ./
# Frozen install — lockfile is the supply-chain checkpoint.
RUN npm ci --omit=dev

FROM base AS runtime
WORKDIR /app/backend
ENV NODE_ENV=production
ENV PORT=5001
COPY --from=deps /app/backend/node_modules ./node_modules
COPY package.json ./
COPY . .
# server.js reads MONGODB_URI/JWT secrets from the environment — never from
# the image. An image with baked secrets defeats the vault policy.
USER app
EXPOSE 5001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:5001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
