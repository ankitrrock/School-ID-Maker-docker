# Build context MUST be the repo root (see docker-compose.yml) for the same
# pnpm workspace reason as artifacts/api-server/Dockerfile.
FROM node:22-alpine AS build

RUN corepack enable && corepack prepare pnpm@10.18.3 --activate

WORKDIR /repo
COPY . .

RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @workspace/mockup-sandbox run build

FROM nginx:alpine
COPY --from=build /repo/artifacts/mockup-sandbox/dist /usr/share/nginx/html
COPY artifacts/mockup-sandbox/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
