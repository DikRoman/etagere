FROM alpine:3.21

ARG PB_VERSION=0.25.9
ARG TARGETARCH

RUN apk add --no-cache ca-certificates unzip curl \
  && ARCH="$TARGETARCH" \
  && if [ "$ARCH" = "amd64" ]; then PB_ARCH=amd64; \
     elif [ "$ARCH" = "arm64" ]; then PB_ARCH=arm64; \
     else PB_ARCH=amd64; fi \
  && curl -fsSL -o /tmp/pb.zip \
    "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${PB_ARCH}.zip" \
  && unzip /tmp/pb.zip -d /pb \
  && chmod +x /pb/pocketbase \
  && rm /tmp/pb.zip \
  && apk del unzip curl

WORKDIR /pb
EXPOSE 8090

CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090", "--dir=/pb/pb_data", "--migrationsDir=/pb/pb_migrations"]
