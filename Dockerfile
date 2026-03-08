FROM oven/bun:1-alpine

WORKDIR /app

# Install the tools required to download and run nats-server inside the container.
RUN apk add --no-cache curl tar bash

# Install nats-server for the current image architecture.
RUN ARCH=$(uname -m) \
    && if [ "$ARCH" = "x86_64" ]; then NATS_ARCH="amd64"; else NATS_ARCH="arm64"; fi \
    && curl -L "https://github.com/nats-io/nats-server/releases/download/v2.12.0/nats-server-v2.12.0-linux-${NATS_ARCH}.tar.gz" -o nats-server.tgz \
    && tar -xzf nats-server.tgz \
    && cp nats-server-v2.12.0-linux-${NATS_ARCH}/nats-server /usr/local/bin/nats-server \
    && chmod +x /usr/local/bin/nats-server \
    && rm -rf nats-server.tgz nats-server-v2.12.0-linux-${NATS_ARCH}

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

RUN chmod +x /app/start.sh

ENV STAGE=uat
ENV NODE_ENV=uat
ENV HOST=0.0.0.0
ENV PORT=10000

EXPOSE 10000

CMD ["/app/start.sh"]