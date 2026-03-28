FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app
ENV HUSKY=0

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/backend/package.json apps/backend/
RUN echo "node-linker=hoisted" > .npmrc
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .
RUN pnpm --filter @memelab-notify/backend exec prisma generate
RUN pnpm --filter @memelab-notify/backend build
RUN cd /app && tar cf /tmp/node_modules.tar node_modules
FROM node:20-alpine AS runtime
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
COPY --from=build /app/apps/backend/dist ./dist
COPY --from=build /tmp/node_modules.tar /tmp/node_modules.tar
RUN tar xf /tmp/node_modules.tar && rm /tmp/node_modules.tar
COPY --from=build /app/apps/backend/package.json ./
COPY --from=build /app/apps/backend/prisma ./prisma
USER appuser
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "const h=require('http');h.get('http://localhost:'+(process.env.PORT||3000)+'/api/health',(r)=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"
CMD ["node", "dist/index.js"]
