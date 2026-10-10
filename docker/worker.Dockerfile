FROM node:22.17.0-alpine3.22@sha256:fc3e945f920b7e3000cd1af86c4ae406ec70c72f328b667baf0f3a8910d69eed AS base
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@11.20.0 --activate

FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/backend/package.json packages/backend/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/utils/package.json packages/utils/package.json
COPY packages/config-ts/package.json packages/config-ts/package.json

FROM manifests AS dependencies
RUN --mount=type=cache,id=honey-worker-pnpm-store,target=/root/.local/share/pnpm/store/v11,sharing=locked \
  pnpm install --filter=@honey/worker... --frozen-lockfile \
    --network-concurrency=4 --fetch-retries=5 --fetch-timeout=300000

FROM dependencies AS build
COPY packages/config-ts packages/config-ts
COPY packages/db packages/db
COPY packages/core packages/core
COPY packages/utils packages/utils
COPY packages/backend packages/backend
COPY apps/worker apps/worker
RUN pnpm --filter=@honey/worker... run build

FROM dependencies AS production-dependencies
RUN --mount=type=cache,id=honey-worker-pnpm-store,target=/root/.local/share/pnpm/store/v11,sharing=locked \
  CI=true pnpm install --prod --filter=@honey/worker... --offline --frozen-lockfile

FROM node:22.17.0-alpine3.22@sha256:fc3e945f920b7e3000cd1af86c4ae406ec70c72f328b667baf0f3a8910d69eed AS runtime
RUN apk add --no-cache tini
WORKDIR /app
ENV NODE_ENV=production
COPY --from=production-dependencies --chown=node:node /workspace/node_modules ./node_modules
COPY --from=production-dependencies --chown=node:node /workspace/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=production-dependencies --chown=node:node /workspace/packages/backend/node_modules ./packages/backend/node_modules
COPY --from=production-dependencies --chown=node:node /workspace/packages/db/node_modules ./packages/db/node_modules
COPY --from=production-dependencies --chown=node:node /workspace/apps/worker/package.json ./apps/worker/package.json
COPY --from=production-dependencies --chown=node:node /workspace/packages/backend/package.json ./packages/backend/package.json
COPY --from=production-dependencies --chown=node:node /workspace/packages/db/package.json ./packages/db/package.json
COPY --from=production-dependencies --chown=node:node /workspace/packages/core/package.json ./packages/core/package.json
COPY --from=production-dependencies --chown=node:node /workspace/packages/utils/package.json ./packages/utils/package.json
COPY --from=build --chown=node:node /workspace/apps/worker/dist ./apps/worker/dist
COPY --from=build --chown=node:node /workspace/packages/backend/dist ./packages/backend/dist
COPY --from=build --chown=node:node /workspace/packages/db/dist ./packages/db/dist
COPY --from=build --chown=node:node /workspace/packages/core/dist ./packages/core/dist
COPY --from=build --chown=node:node /workspace/packages/utils/dist ./packages/utils/dist
USER node
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/worker/dist/main.js"]
