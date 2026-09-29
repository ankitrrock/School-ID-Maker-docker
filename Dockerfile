FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --chown=node:node server ./server
COPY --chown=node:node public ./public
RUN mkdir -p data/uploads data/secrets && chown -R node:node data
USER node
EXPOSE 3000
CMD ["node", "--require", "./server/docker-env.js", "server/index.js"]
