FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app
ENV HUSKY=0

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/backend/package.json apps/backend/
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .
RUN pnpm --filter @memelab-notify/backend exec prisma generate
RUN pnpm --filter @memelab-notify/backend build
# Prune to production deps
RUN pnpm --filter @memelab-notify/backend deploy --prod /app/pruned
RUN cp -r $(find /app/node_modules/.pnpm -path "*/@prisma/client" -type d | head -1)/../../.prisma /app/pruned/node_modules/.prisma 2>/dev/null || true

FROM node:20-alpine AS runtime
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
COPY --from=build /app/pruned/dist ./dist
COPY --from=build /app/pruned/node_modules ./node_modules
COPY --from=build /app/pruned/package.json ./
COPY --from=build /app/apps/backend/prisma ./prisma
USER appuser
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "const h=require('http');h.get('http://localhost:'+(process.env.PORT||3000)+'/api/health',(r)=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"
CMD ["node", "dist/index.js"]
