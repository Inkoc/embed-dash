FROM node:26.13.1-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@12.23.0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
RUN pnpm --filter @embed-dash/server deploy --prod --legacy /runtime

FROM node:26.13.1-slim AS runtime
ENV NODE_ENV=production DATA_DIR=/data PORT=8742 HOST=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /runtime/ ./server/
COPY --from=build --chown=node:node /app/apps/server/drizzle/ ./server/drizzle/
COPY --from=build --chown=node:node /app/apps/web/dist/ ./web/dist/
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 8742
CMD ["node", "server/dist/index.js"]
