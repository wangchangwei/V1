FROM node:18-alpine

RUN apk add --no-cache curl bash

RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

WORKDIR /app

# Use the vendored Next.js template bundled with V1 (backend/template/)
# instead of fetching from a remote repo at build time.
COPY ./template /app/my-nextjs-app

WORKDIR /app/my-nextjs-app

RUN bun install

EXPOSE 3001

CMD ["bun", "dev"]