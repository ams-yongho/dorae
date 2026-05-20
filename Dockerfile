# syntax=docker/dockerfile:1.7

# ---------- deps ----------
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# corepack: pnpm 활성화
RUN corepack enable

# 의존성 파일만 먼저 복사 (캐시 최적화)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
# prisma schema는 postinstall(`prisma generate`)에 필요
COPY prisma ./prisma

RUN pnpm install --frozen-lockfile --config.node-linker=hoisted

# ---------- builder ----------
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
RUN corepack enable

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# ---------- runner ----------
FROM node:22-alpine AS runner
RUN apk add --no-cache tini openssl
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    TZ=Asia/Seoul

# next.js standalone 산출물
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# prisma migrate deploy를 entrypoint에서 돌리기 위해 CLI/엔진/스키마/마이그레이션 복사
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma

# entrypoint (Task 3에서 생성 — 이번에는 COPY 라인만 둠)
COPY docker/app/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# 비-root 유저
USER node

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["./entrypoint.sh"]
