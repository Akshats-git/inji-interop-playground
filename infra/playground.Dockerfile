# The playground image: the React UI and the BFF (API, recording gateway, Reference Wallet and Verifier)
# in one Node process on one origin. Build context is the repository root:
#   docker build -f infra/playground.Dockerfile -t inji-interop-playground:local .

ARG NODE_VERSION=22.14.0

FROM node:${NODE_VERSION}-alpine AS build
RUN corepack enable
WORKDIR /src
# Manifests first, so dependency installs are cached until a lockfile or package.json changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY apps/bff/package.json apps/bff/
COPY apps/ui/package.json apps/ui/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
COPY packages packages
COPY apps apps
RUN pnpm --filter @playground/ui build && pnpm --filter @playground/bff build
# A self-contained production install of the BFF's runtime dependencies.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm --filter @playground/bff deploy --prod /deploy

FROM node:${NODE_VERSION}-alpine
LABEL org.opencontainers.image.title="Inji Interoperability Playground" \
      org.opencontainers.image.licenses="MPL-2.0"
ENV NODE_ENV=production \
    PORT=8080 \
    UI_DIST=/app/ui
WORKDIR /app
COPY --from=build /deploy/node_modules ./node_modules
COPY --from=build /deploy/package.json ./package.json
COPY --from=build /src/apps/bff/dist ./dist
COPY --from=build /src/apps/ui/dist ./ui
USER node
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=6 \
  CMD wget -qO- http://127.0.0.1:8080/api/health >/dev/null || exit 1
CMD ["node", "dist/main.js"]
