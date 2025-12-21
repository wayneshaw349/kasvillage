# Dockerfile for KasVillage Backend (Standard Rust Setup)
# ============================================================================
# Stage 1: Build
# ============================================================================
FROM rust:1.75-slim-bookworm as builder

WORKDIR /build

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    pkg-config \
    libssl-dev \
    protobuf-compiler \
    git \
    clang \
    && rm -rf /var/lib/apt/lists/*

# Copy configuration and source
COPY Cargo.toml .
# No Cargo.lock yet
COPY src ./src

# Build the binary
# We removed the --bin flag. Rust will auto-detect src/main.rs
# and name the binary "kasvillage-l2" (matching Cargo.toml package name)
RUN cargo build --release 2>&1 | tee build.log

# Verify the binary exists (Look for kasvillage-l2 now)
RUN ls -lh target/release/kasvillage-l2 || (cat build.log && exit 1)

# ============================================================================
# Stage 2: Runtime
# ============================================================================
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    ca-certificates \
    curl \
    tini \
    && rm -rf /var/lib/apt/lists/*

# Create user
RUN useradd -m -u 1000 -s /bin/bash kasvillage

# Copy the binary from the builder (Note the name change!)
COPY --from=builder /build/target/release/kasvillage-l2 /usr/local/bin/app

# Permissions
RUN chmod +x /usr/local/bin/app
WORKDIR /app
RUN chown -R kasvillage:kasvillage /app
USER kasvillage

# Config
EXPOSE 8080
ENTRYPOINT ["/usr/bin/tini", "--"]

# Run the app
CMD ["app"]
