# -----------------------------------------------------------------------------
# RK Campaign Intelligence Platform - API image (Phase 10)
#
# Multi-stage, and the stages exist for a reason rather than for tidiness: the
# build stage needs the whole workspace (the API imports five local packages and
# generates a Prisma client), while the thing that ends up in production needs
# none of that. Shipping one stage would put the TypeScript sources, the test
# suite, the Prisma CLI and every devDependency onto a public-facing host.
#
# The final image runs as a NON-ROOT user. A process that never needs to write
# to its own filesystem should not be able to, and an RCE in a dependency is a
# great deal less useful without it.
#
# Build from the REPOSITORY ROOT, not from this directory - the npm workspace
# layout means the lockfile and the shared packages live above:
#
#   docker build -f apps/api/Dockerfile -t rk-api:local .
# -----------------------------------------------------------------------------

# Pinned to the version in .nvmrc. Alpine keeps the attack surface small; the
# API has no native dependency that needs glibc.
FROM node:22-alpine AS build

WORKDIR /app

# Copy manifests before sources so a source-only change does not invalidate the
# dependency layer. Every workspace manifest is needed for `npm ci` to resolve
# the tree, which is why they are listed individually.
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/mobile/package.json ./apps/mobile/
COPY packages/config/package.json ./packages/config/
COPY packages/types/package.json ./packages/types/
COPY packages/utils/package.json ./packages/utils/
COPY packages/graphql/package.json ./packages/graphql/
COPY packages/ui/package.json ./packages/ui/
COPY packages/design-tokens/package.json ./packages/design-tokens/

# `--ignore-scripts` because the root postinstall builds design tokens, which
# the API does not use and which would pull the whole UI toolchain in here.
RUN npm ci --ignore-scripts

COPY . .

# The client must be generated inside the image: it contains native query
# engines selected for this platform, so one generated on a developer's laptop
# is not portable into Alpine.
RUN npm run db:generate \
    && npm run build -w @rk/api

# Reinstall without devDependencies so the runtime stage copies a production
# tree. Done here rather than in the runtime stage so no build tooling is ever
# present in the final image.
RUN npm prune --omit=dev

# -----------------------------------------------------------------------------

FROM node:22-alpine AS runtime

# dumb-init gives the process a real PID 1, so SIGTERM reaches Node and the
# server's graceful shutdown runs. Without it, an orchestrator's stop signal is
# swallowed and connections are cut mid-request.
RUN apk add --no-cache dumb-init

ENV NODE_ENV=production
WORKDIR /app

# `node` already exists in the base image as uid 1000.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/
# Migrations travel with the image so the deploy step runs exactly the ones this
# build was tested against, rather than whatever is on the deploying machine.
COPY --from=build --chown=node:node /app/apps/api/prisma ./apps/api/prisma

USER node
WORKDIR /app/apps/api

EXPOSE 4000

# Liveness only. Readiness is /ready and belongs to the orchestrator, which can
# drain traffic; a failing HEALTHCHECK here would restart the container, and a
# brief database blip must not do that.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.GRAPHQL_PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]

# Migrations are NOT run here. They are a separate, reviewed deploy step - see
# docs/DEPLOYMENT.md. A container that migrates on boot will run the migration
# once per replica, and will do it before anybody has decided the deploy is safe.
CMD ["node", "dist/server.js"]
