# SyncVault dashboard

The server's web UI: setup, sign-in, recovery, the consent screen for apps, and
the admin dashboard. The server serves its build.

## Running locally

Start the server (`bun run dev` in `packages/server`), then:

```sh
bun run dev    # http://localhost:5174
```

It forwards API requests to the server on :3000. Open the server's setup link
here, on :5174, and connect apps to `http://localhost:5174`.

| Command          | What it does                                   |
| ---------------- | ---------------------------------------------- |
| `bun run dev`    | Starts the dev server.                         |
| `bun run build`  | Builds into `build/`, which the server serves. |
| `bun run check`  | Type-checks.                                   |
| `bun run lint`   | Checks formatting and lint.                    |
| `bun run format` | Formats.                                       |

Don't build while the dev server is running: both write to `.svelte-kit`.
