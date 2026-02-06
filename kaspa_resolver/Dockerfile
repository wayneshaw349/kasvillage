FROM rust:latest as builder

WORKDIR /build

# Clone kaspa-resolver
RUN git clone https://github.com/aspectron/kaspa-resolver.git .

# Build release binary
RUN cargo build --release

# Runtime stage
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy binary from builder
COPY --from=builder /build/target/release/kaspa-resolver /app/kaspa-resolver

# Copy default config
COPY --from=builder /build/Resolver.toml /app/Resolver.toml

EXPOSE 8888

ENV RESOLVER_ADDRESS=0.0.0.0:8888

CMD ["/app/kaspa-resolver"]
