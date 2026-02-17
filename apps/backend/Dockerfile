FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/backend/package.json apps/backend/
RUN pnpm install --frozen-lockfile --filter backend

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/backend/node_modules ./apps/backend/node_modules
COPY . .
RUN pnpm --filter backend exec prisma generate
RUN pnpm --filter backend build

FROM base AS runtime
COPY --from=build /app/apps/backend/dist ./apps/backend/dist
COPY --from=build /app/apps/backend/prisma ./apps/backend/prisma
COPY --from=build /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./

EXPOSE 3000
CMD ["node", "apps/backend/dist/index.js"]
