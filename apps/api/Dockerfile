# --- build stage -------------------------------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Install workspace deps first for layer caching (manifests only).
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/ui/package.json packages/ui/
RUN npm ci

# Source + build (postinstall generated the Prisma client before this COPY,
# so regenerate against the final schema).
COPY . .
RUN npm run build --workspace @monorepo/shared-types \
 && npx prisma generate --schema=apps/api/prisma/schema.prisma \
 && npm run build --workspace @monorepo/api \
 && npm prune --omit=dev

# --- runtime (distroless) ------------------------------------------------------
# Note: the Prisma query engine needs libssl. distroless/debian12 ships it;
# if you hit engine-load errors on a different base, fall back to
# node:22-bookworm-slim for this stage.
FROM gcr.io/distroless/nodejs22-debian12 AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
EXPOSE 3001
USER nonroot
CMD ["apps/api/dist/main.js"]
