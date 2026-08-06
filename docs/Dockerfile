# The documentation site. A real Nuxt app rather than a static export, because
# `robots.txt` and `sitemap.xml` are Nitro routes built from the content collection.
#
# Built from the **repository root** as context: the docs are a pnpm workspace member,
# so the lockfile and the workspace manifest have to come along.

FROM node:22-bookworm-slim AS builder

WORKDIR /app

RUN corepack enable

# @nuxt/content stores the parsed content in sqlite, and better-sqlite3 falls back to
# compiling when no prebuilt binary fits. Without these the install dies in node-gyp.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# The manifests first, so a content change does not invalidate the install layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY docs/package.json ./docs/

RUN pnpm install --frozen-lockfile

COPY docs ./docs

RUN pnpm --filter docs build

FROM node:22-bookworm-slim

WORKDIR /app

# Only the output. No sources, no node_modules, no package manager.
COPY --from=builder /app/docs/.output ./.output

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

# Canonical links, the sitemap and every social card url are built from this. It has a
# default baked in, and the compose file overrides it per environment.
ENV NUXT_PUBLIC_SITE_URL=https://pigeon.fh-softdev.de

CMD ["node", ".output/server/index.mjs"]
