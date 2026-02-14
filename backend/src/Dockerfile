FROM node:18-alpine

RUN apk add --no-cache curl bash

RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

WORKDIR /app

# Clone the December Next.js template repository
RUN curl -L https://github.com/ntegrals/december-nextjs-template/archive/main.tar.gz | tar -xz && \
    mv december-nextjs-template-main my-nextjs-app

WORKDIR /app/my-nextjs-app

RUN bun install

EXPOSE 3001

CMD ["bun", "dev"]