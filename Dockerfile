FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY scripts/container-install.cjs scripts/container-install.cjs
RUN --mount=type=secret,id=cloud_https_proxy --mount=type=secret,id=cloud_http_proxy --mount=type=secret,id=cloud_ca node scripts/container-install.cjs
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN APP_MODE=demo npm run build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000
CMD ["npm", "run", "start:live"]
