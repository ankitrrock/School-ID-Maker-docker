# Build context MUST be the repo root (see docker-compose.yml), because this
# is a pnpm workspace: @workspace/db and @workspace/api-zod are consumed as
# workspace:* packages by artifacts/api-server.
FROM node:22-alpine

RUN corepack enable && corepack prepare pnpm@10.18.3 --activate

WORKDIR /repo
COPY . .

RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @workspace/api-server run build

WORKDIR /repo/artifacts/api-server
ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "--enable-source-maps", "dist/index.mjs"]
