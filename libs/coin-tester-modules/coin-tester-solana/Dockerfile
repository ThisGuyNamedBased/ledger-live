ARG AGAVE_VERSION=4.2.2

FROM debian:bookworm AS builder
ARG AGAVE_VERSION

SHELL ["/bin/bash", "-c"]

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        build-essential curl wget pkg-config bzip2 \
        libssl-dev libudev-dev clang libclang-dev gcc zlib1g-dev llvm cmake make \
        libprotobuf-dev protobuf-compiler \
        perl libfindbin-libs-perl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /root
RUN wget -O agave.tar.gz \
    "https://github.com/anza-xyz/agave/archive/refs/tags/v${AGAVE_VERSION}.tar.gz" && \
    mkdir agave && tar -xzf agave.tar.gz --strip-components=1 -C agave

RUN curl https://sh.rustup.rs -sSf | sh -s -- -y --default-toolchain stable
ENV PATH=/root/.cargo/bin:$PATH
ENV LIBCLANG_PATH=/usr/lib/llvm-14/lib

WORKDIR /root/agave
RUN cargo build --bin solana-test-validator --bin solana --release

FROM debian:bookworm-slim
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*
COPY --from=builder /root/agave/target/release/solana-test-validator /usr/local/bin/
COPY --from=builder /root/agave/target/release/solana /usr/local/bin/
EXPOSE 8899 8900
