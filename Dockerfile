# The SyncVault server, serving the dashboard's build. Build from the repo root:
#   docker build -t syncvault .
# The database is in the /data volume. See packages/server/README.md.

FROM oven/bun:1.3 AS build
WORKDIR /app
# Every workspace's manifest, so the lockfile matches and the install stays
# cached until a dependency changes.
COPY package.json bun.lock ./
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
COPY packages/dashboard/package.json packages/dashboard/
COPY examples/todos/package.json examples/todos/
RUN bun install --frozen-lockfile

COPY packages packages
ENV NODE_ENV=production
RUN bun run --cwd packages/dashboard build
# A standalone binary, with the migrations inlined (src/db/migrations.ts).
RUN bun build --compile --minify-whitespace --minify-syntax \
	packages/server/src/index.ts --outfile /out/syncvault
RUN mkdir /data

FROM gcr.io/distroless/base-debian12:nonroot
WORKDIR /app
COPY --from=build /out/syncvault syncvault
COPY --from=build /app/packages/dashboard/build dashboard
COPY --from=build --chown=nonroot:nonroot /data /data

ENV NODE_ENV=production \
	DATABASE_FILE=/data/syncvault.sqlite \
	DASHBOARD_DIR=/app/dashboard \
	PORT=3000
VOLUME /data
EXPOSE 3000
CMD ["./syncvault"]
