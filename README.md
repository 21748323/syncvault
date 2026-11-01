# SyncVault

A self-hostable sync server for local-first web apps. Apps keep their data on
the device and work offline, and sync it across devices through a SyncVault
server that you host.

| Path                                       | What it is                                                    |
| ------------------------------------------ | ------------------------------------------------------------- |
| [`packages/server`](packages/server)       | The sync server, which also serves the dashboard.             |
| [`packages/dashboard`](packages/dashboard) | The server's web UI: setup, sign-in, app consent and admin.   |
| [`packages/client`](packages/client)       | The Client SDK (`@syncvault/client`) for connecting web apps. |
| [`examples/todos`](examples/todos)         | A demo todos app built on the SDK.                            |

## Deploying

The server runs in Docker. From this folder:

```sh
docker compose up -d --build
docker compose logs syncvault    # shows the setup link
```

Open the setup link and register a passkey. See the server's
[README](packages/server/README.md#deploying) for HTTPS, recovery, upgrades and
backups.

The todos demo is a static site: run `bun run build:todos`, then host
`examples/todos/build` anywhere.

## Running locally

You need [Bun](https://bun.sh) 1.3.

```sh
bun install
```

Then start each of these in its own terminal:

```sh
bun run dev:server       # :3000; prints a setup link
bun run dev:dashboard    # :5174
bun run dev:todos        # :5173
```

1. Open the setup link on `http://localhost:5174` (not :3000) and register a
   passkey.
2. Open the todos app at `http://localhost:5173`, click the sync status in the
   header, and connect to `http://localhost:5174`.

## Commands

| Command                   | What it does                                       |
| ------------------------- | -------------------------------------------------- |
| `bun run dev:server`      | Starts the server.                                 |
| `bun run dev:dashboard`   | Starts the dashboard.                              |
| `bun run dev:todos`       | Starts the todos app.                              |
| `bun run recover`         | Issues a one-time token to register a new passkey. |
| `bun run build:dashboard` | Builds the dashboard.                              |
| `bun run build:todos`     | Builds the todos app.                              |
| `bun run build:docker`    | Builds the server's Docker image.                  |
| `bun run test`            | Runs the tests.                                    |
| `bun run check`           | Type-checks every package.                         |
| `bun run lint`            | Lints every package that has a linter.             |
| `bun run format`          | Formats every package.                             |
