FROM docker.io/library/debian:buster AS builder
WORKDIR /build

RUN apt-get update && apt-get install -y curl unzip
RUN curl -fsSL https://deno.land/x/install/install.sh | sh
RUN mv /root/.deno/bin/deno /usr/local/bin

COPY source source
RUN /usr/local/bin/deno compile --allow-env --allow-net --output dooris-telegram-bot source/index.ts


FROM docker.io/library/debian:buster-slim
COPY --from=builder /build/dooris-telegram-bot /usr/local/bin
CMD /usr/local/bin/dooris-telegram-bot
