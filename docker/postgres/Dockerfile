FROM postgres:18-bookworm

# pg_partman is shipped by PGDG as `postgresql-18-partman`. pgcrypto is in-tree.
RUN apt-get update \
  && apt-get install -y --no-install-recommends postgresql-18-partman \
  && rm -rf /var/lib/apt/lists/*
