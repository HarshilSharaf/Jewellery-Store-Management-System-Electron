# Self-contained MySQL image for the Jewellery Store Management System.
#
# Bakes the schema, migrations, stored procedures, and seed data into the
# image so `docker run` (or `docker compose up`) needs no bind mounts.
#
# Build:   docker build -t jewellery-db .
# Run:     docker run --rm --env-file .env -p 3306:3306 jewellery-db
# Compose: docker compose up -d   (compose points at this Dockerfile)
FROM mysql:8.0

# Match the runtime uid/gid the base image expects.
USER root

# Populate the two directories the mysql:8.0 entrypoint consumes:
#   /docker-entrypoint-initdb.d — scripts run on first container start
#   /scripts                    — path that 01-init-db.sh reads .sql files from
COPY docker/init/ /docker-entrypoint-initdb.d/
COPY Scripts/    /scripts/

# init script is bash; ensure LF line endings + executable bit even if the
# repo was cloned with Windows line endings.
RUN find /docker-entrypoint-initdb.d -type f -name '*.sh' -exec sed -i 's/\r$//' {} + \
    && chmod +x /docker-entrypoint-initdb.d/*.sh

EXPOSE 3306

# Ping mysqld to prove the server is up; the same probe compose used to declare
# inline. Keeping it in the image means anyone running `docker run` gets it
# too, not just compose users.
HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
    CMD mysqladmin ping -h localhost || exit 1
