FROM node:22-alpine AS frontend-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
COPY package.json /app/package.json
# "main · 7e18930" on builds from main, empty on releases (set by the GitHub workflow)
ARG APP_BUILD=""
ENV APP_BUILD=$APP_BUILD
RUN npm run build

FROM node:22-alpine AS server-build
# better-sqlite3 downloads a ready-made binary. If that download fails, npm compiles it instead, which needs
# these tools; without them the whole build failed. They stay in this stage, not in the final image.
RUN apk add --no-cache python3 make g++
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
# Compile, then drop the dev packages: the final image copies this node_modules, so the packages are
# downloaded once per platform instead of twice
RUN npx tsc && npm prune --omit=dev

FROM node:22-alpine
RUN apk add --no-cache su-exec
WORKDIR /app
COPY server/package*.json ./server/
COPY --from=server-build /app/server/node_modules ./server/node_modules
COPY --from=server-build /app/server/dist ./server/dist
COPY --from=frontend-build /app/client/dist ./client/dist
# The version and build label for GET /api/version
COPY package.json ./package.json
ARG APP_BUILD=""
ENV APP_BUILD=$APP_BUILD
# The server uses the app's translations for notifications (server/src/utils/i18n.ts)
COPY client/src/i18n ./client/src/i18n
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
    && mkdir -p /app/data \
    && chown -R node:node /app

EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server/dist/index.js"]
