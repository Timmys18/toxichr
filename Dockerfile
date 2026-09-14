FROM node:22-bookworm-slim

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
ENV DATABASE_URL=file:./.data/toxichr.db
RUN npm ci

COPY . .
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
RUN npm run build && mkdir -p /app/.data && chown -R node:node /app/.data /app/.next

USER node
EXPOSE 3100
CMD ["npm", "run", "start", "--", "--hostname", "0.0.0.0", "--port", "3100"]
