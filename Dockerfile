FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
# Only what `npm run build` reads. Copying the lint and format configs here would
# invalidate this layer whenever they change, for a stage that never lints.
COPY tsconfig*.json ./
COPY src ./src
RUN npm run build

FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
RUN useradd --create-home --uid 10001 subzerodev
USER subzerodev
ENTRYPOINT ["node", "dist/cli.js"]
CMD ["--help"]
