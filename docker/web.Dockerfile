FROM node:22.17.0-alpine3.22@sha256:fc3e945f920b7e3000cd1af86c4ae406ec70c72f328b667baf0f3a8910d69eed AS base
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@11.20.0 --activate

FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/i18n/package.json packages/i18n/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/utils/package.json packages/utils/package.json
COPY packages/config-ts/package.json packages/config-ts/package.json

FROM manifests AS dependencies
RUN --mount=type=cache,id=honey-web-pnpm-store,target=/root/.local/share/pnpm/store/v11,sharing=locked \
  pnpm install --filter=@honey/web... --frozen-lockfile \
    --network-concurrency=4 --fetch-retries=5 --fetch-timeout=300000

FROM dependencies AS build
COPY packages/config-ts packages/config-ts
COPY packages/core packages/core
COPY packages/utils packages/utils
COPY packages/contracts packages/contracts
COPY packages/i18n packages/i18n
COPY packages/ui packages/ui
COPY apps/web apps/web
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000
ENV PUBLIC_SITE_URL=http://127.0.0.1:3000
ENV INTERNAL_API_URL=http://127.0.0.1:4000
RUN pnpm --filter=@honey/web... run build

FROM node:22.17.0-alpine3.22@sha256:fc3e945f920b7e3000cd1af86c4ae406ec70c72f328b667baf0f3a8910d69eed AS runtime
RUN apk add --no-cache tini
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Local/image HTTP defaults — HSTS is gated on HTTPS public site origins only.
ENV NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000
ENV PUBLIC_SITE_URL=http://127.0.0.1:3000
ENV INTERNAL_API_URL=http://127.0.0.1:4000
COPY --from=build --chown=node:node /workspace/apps/web/public ./apps/web/public
COPY --from=build --chown=node:node /workspace/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /workspace/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=6 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/fa').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/web/server.js"]
