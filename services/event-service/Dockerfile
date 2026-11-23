FROM node:24.19.0-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY gateway/package.json gateway/package.json
COPY shared/libraries/runtime/package.json shared/libraries/runtime/package.json
COPY services/identity-service/package.json services/identity-service/package.json
COPY services/event-service/package.json services/event-service/package.json
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY shared/libraries/runtime shared/libraries/runtime
COPY services/event-service services/event-service
RUN npm run db:generate -w @lamu/event && npm run build -w @lamu/runtime && npm run build -w @lamu/event

# Migration job: docker compose run event-migrate
FROM build AS tools
ENV NODE_ENV=production PORT=8080
USER node
CMD ["npm","run","db:deploy","-w","@lamu/event"]

FROM build AS production-deps
RUN npm prune --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:24.19.0-bookworm-slim AS runtime
WORKDIR /app
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=build /app/services/event-service/dist services/event-service/dist
COPY --from=build /app/services/event-service/package.json services/event-service/package.json
COPY --from=build /app/shared/libraries/runtime/dist shared/libraries/runtime/dist
COPY --from=build /app/shared/libraries/runtime/package.json shared/libraries/runtime/package.json
ENV NODE_ENV=production PORT=8080
USER node
CMD ["node","services/event-service/dist/main.js"]
