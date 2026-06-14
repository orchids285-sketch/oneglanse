FROM postgres:16

# Install pg_cron and http extension
RUN apt-get update && \
    apt-get install -y \
    postgresql-16-cron \
    postgresql-16-http && \
    rm -rf /var/lib/apt/lists/*

# Bake the init-scripts into the image so they run on first DB init when
# deployed on a platform (Render) that can't compose-mount the init-scripts dir.
# Build context is the repo root (matches docker-compose `context: .`).
COPY packages/db/init-scripts/ /docker-entrypoint-initdb.d/
