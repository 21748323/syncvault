# todos

A demo todo app that works offline and syncs through a SyncVault server, using
the Client SDK ([`@syncvault/client`](../../packages/client)).

## Running locally

From the repository's root, run `bun install`, then start each of these in its
own terminal:

```sh
bun run dev:server       # :3000; prints a setup link
bun run dev:dashboard    # :5174
bun run dev:todos        # :5173
```

1. Open the setup link on `http://localhost:5174` (not :3000) and register a
   passkey.
2. Open `http://localhost:5173`, click the sync status in the header, and
   connect to `http://localhost:5174`.

| Command          | What it does                   |
| ---------------- | ------------------------------ |
| `bun run dev`    | Starts the dev server.         |
| `bun run build`  | Builds the site into `build/`. |
| `bun run check`  | Type-checks.                   |
| `bun run lint`   | Checks formatting and lint.    |
| `bun run format` | Formats.                       |

## Deploying

```sh
bun run build
```

Host `build/` on any static host.
