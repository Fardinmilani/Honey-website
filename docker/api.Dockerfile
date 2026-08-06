FROM node:22.17.0-alpine3.22@sha256:fc3e945f920b7e3000cd1af86c4ae406ec70c72f328b667baf0f3a8910d69eed AS base
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@11.20.0 --activate

FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/backend/package.json packages/backend/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/config-ts/package.json packages/config-ts/package.json

FROM manifests AS build
RUN pnpm install --filter=@honey/api... --frozen-lockfile
COPY packages/config-ts packages/config-ts
COPY packages/db packages/db
COPY packages/backend packages/backend
COPY apps/api apps/api
RUN pnpm --filter=@honey/api... run build

FROM manifests AS production-dependencies
RUN pnpm install --prod --filter=@honey/api... --frozen-lockfile

FROM node:22.17.0-alpine3.22@sha256:fc3e945f920b7e3000cd1af86c4ae406ec70c72f328b667baf0f3a8910d69eed AS runtime
RUN apk add --no-cache tini
WORKDIR /app
ENV NODE_ENV=production
COPY --from=production-dependencies --chown=node:node /workspace/node_modules ./node_modules
COPY --from=production-dependencies --chown=node:node /workspace/apps/api/node_modules ./apps/api/node_modules
COPY --from=production-dependencies --chown=node:node /workspace/packages/backend/node_modules ./packages/backend/node_modules
COPY --from=production-dependencies --chown=node:node /workspace/packages/db/node_modules ./packages/db/node_modules
COPY --from=production-dependencies --chown=node:node /workspace/apps/api/package.json ./apps/api/package.json
COPY --from=production-dependencies --chown=node:node /workspace/packages/backend/package.json ./packages/backend/package.json
COPY --from=production-dependencies --chown=node:node /workspace/packages/db/package.json ./packages/db/package.json
COPY --from=build --chown=node:node /workspace/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /workspace/packages/backend/dist ./packages/backend/dist
COPY --from=build --chown=node:node /workspace/packages/db/dist ./packages/db/dist
USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=6 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4000/readyz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/api/dist/main.js"]
