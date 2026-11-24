# Build and run on glibc: Nitro traces native dependencies (including Resvg).
FROM oven/bun:1.4.4 AS bun
FROM node:22-bookworm-slim AS builder
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
COPY apps/puzzled/package.json ./apps/puzzled/
RUN bun install --frozen-lockfile --ignore-scripts

COPY apps/puzzled ./apps/puzzled
COPY brand ./brand
COPY config/commercial/catalogue.json ./config/commercial/catalogue.json
COPY scripts/checkout-journey.ts scripts/money-merchant.ts ./scripts/
RUN bun build ./scripts/checkout-journey.ts --target=node --external=playwright --outfile=/app/checkout-journey.mjs
RUN cd apps/puzzled && bun -e 'const fs = require("node:fs"); const path = require("node:path"); const {createRequire} = require("node:module"); const resolve = createRequire(require.resolve("playwright/package.json")); const target = "/app/checkout-deps/node_modules"; fs.mkdirSync(target, { recursive: true }); for (const name of ["playwright", "playwright-core"]) fs.cpSync(path.dirname(resolve.resolve(name + "/package.json")), target + "/" + name, { recursive: true, dereference: true });'
RUN cd apps/puzzled && bun run build && test -z "$(find .output/public -name '*.map')"

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NITRO_HOST=0.0.0.0 PORT=3000
# Used only by the explicit one-shot checkout verifier Job.
RUN apt-get update && apt-get install -y --no-install-recommends chromium && rm -rf /var/lib/apt/lists/*
ENV PUZZLED_CHECKOUT_CHROMIUM_PATH=/usr/bin/chromium
USER node
COPY --from=builder --chown=node:node /app/apps/puzzled/.output/server ./server
COPY --from=builder --chown=node:node /app/apps/puzzled/.output/public ./public
COPY --from=builder --chown=node:node /app/checkout-journey.mjs ./checkout-journey.mjs
COPY --from=builder --chown=node:node /app/checkout-deps/node_modules ./node_modules
EXPOSE 3000
CMD ["node", "server/index.mjs"]
