# Stage 1: Build
FROM rust:latest AS builder
RUN rustup default nightly 
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    ca-certificates \
    build-essential \
    protobuf-compiler \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY Cargo.toml Cargo.lock* ./
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo +nightly build --release 2>/dev/null || true
RUN rm -rf src
COPY src ./src
RUN touch src/main.rs
RUN cargo +nightly build --release

# Stage 2: Runtime
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    curl \
    && rm -rf /var/lib/apt/lists/*
RUN useradd -m -u 1000 kasvillage
WORKDIR /app
COPY --from=builder /app/target/release/kasvillage-l2 /usr/local/bin/kasvillage
RUN chown -R kasvillage:kasvillage /app
USER kasvillage

ENV RUST_LOG=info
ENV APP_MODE=backend
ENV PORT=8080
ENV FIRESTORE_PROJECT_ID=kasvillage-prod

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:8080/api/health || exit 1

CMD ["kasvillage", "--port", "8080", "--network", "mainnet"]
