FROM node:24.19.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY gateway/package.json gateway/package.json
COPY shared/libraries/runtime/package.json shared/libraries/runtime/package.json
COPY services/identity-service/package.json services/identity-service/package.json
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY shared/libraries/runtime shared/libraries/runtime
COPY shared/contracts shared/contracts
COPY gateway gateway
RUN npm run build -w @lamu/runtime && npm run build -w @lamu/gateway
FROM build AS production-deps
RUN npm prune --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:24.19.0-bookworm-slim AS runtime
WORKDIR /app
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=build /app/gateway/dist gateway/dist
COPY --from=build /app/gateway/package.json gateway/package.json
COPY --from=build /app/shared/libraries/runtime/dist shared/libraries/runtime/dist
COPY --from=build /app/shared/libraries/runtime/package.json shared/libraries/runtime/package.json
COPY --from=build /app/shared/contracts shared/contracts
ENV NODE_ENV=production PORT=8080
USER node
CMD ["node","gateway/dist/main.js"]

