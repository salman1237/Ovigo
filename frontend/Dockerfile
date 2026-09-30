FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# npm ci requires the lockfile to exactly match package.json's resolved tree,
# including platform-specific optional deps — a lockfile regenerated on
# Windows can omit Linux-only optional packages (e.g. @emnapi/*) that this
# Linux build container needs, so npm ci fails with "lock file out of sync"
# even though nothing is actually wrong. npm install resolves/updates as
# needed instead of hard-failing on that mismatch.
RUN npm install

FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
