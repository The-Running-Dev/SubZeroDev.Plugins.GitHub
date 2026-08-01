FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
# Only what `npm run build` reads. Copying the lint and format configs here would
# invalidate this layer whenever they change, for a stage that never lints.
COPY tsconfig*.json ./
COPY src ./src
COPY tools ./tools
COPY schemas ./schemas
COPY plugin.yaml ./
RUN npm run build
RUN test -f dist/plugin.manifest.json

FROM node:24-bookworm-slim
ENV NODE_ENV=production
ENV SUBZERODEV_PLUGIN_CONFIG=/etc/subzerodev/plugin.config.json
ENV SUBZERODEV_PLUGIN_CACHE=/var/lib/subzerodev/cache
ENV SUBZERODEV_PLUGIN_OUTPUT=/var/lib/subzerodev/output
ARG VERSION=0.1.0
ARG REVISION=development
LABEL org.opencontainers.image.title="SubZeroDev GitHub Plugin" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.source="https://github.com/The-Running-Dev/SubZeroDev.Plugins.GitHub" \
      org.opencontainers.image.revision="${REVISION}" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.description="Provider-independent GitHub repository data plugin" \
      com.subzerodev.plugin.id="subzerodev.github"
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/schemas ./schemas
COPY --from=build /app/plugin.yaml ./plugin.yaml
RUN useradd --create-home --uid 10001 subzerodev \
    && mkdir -p /etc/subzerodev /var/lib/subzerodev/cache /var/lib/subzerodev/output \
    && chown -R 10001:10001 /var/lib/subzerodev
USER subzerodev
ENTRYPOINT ["node", "dist/cli.js"]
CMD ["--help"]
