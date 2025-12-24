# ============================================================================
# KASVILLAGE-L2 PRODUCTION DOCKERFILE
# Multi-stage build for a tiny, secure image
# ============================================================================

# Stage 1: Build (Compiler)
FROM rust:1.85-slim-bookworm AS builder

# Install system dependencies for ZK-math and SSL
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    ca-certificates \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy Cargo files first to cache dependencies
COPY Cargo.toml Cargo.lock ./

# Create a dummy main.rs to compile dependencies separately (Faster builds)
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release || true
RUN rm -rf src

# Copy your actual 47,000 line source code
COPY src ./src

# Build the real binary
RUN cargo build --release

# Stage 2: Runtime (Tiny image for Akash)
FROM debian:bookworm-slim

# Install runtime libraries (Required for AWS and API calls)
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Security: Run as a non-root user
RUN useradd -m -u 1000 kasvillage
WORKDIR /app

# Copy the binary from the builder
# Ensure this matches the name in your Cargo.toml [package]
COPY --from=builder /app/target/release/kasvillage-l2 /usr/local/bin/kasvillage

RUN chown -R kasvillage:kasvillage /app
USER kasvillage

# Default Environment Variables
ENV RUST_LOG=info
ENV APP_MODE=backend

# Actix-web Port
EXPOSE 8080

# Health check to let Akash know the server is alive
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:8080/api/state || exit 1

# Start command derived from your main.rs logic
CMD ["kasvillage", "--port", "8080", "--network", "mainnet"]
