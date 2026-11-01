# SyncVault server

The sync server that apps connect to. It also serves the dashboard.

## Running locally

```sh
bun install
cp .env.example .env    # optional: every setting has a default
bun run dev             # :3000
```

To finish setup, start the dashboard too (`bun run dev` in
`packages/dashboard`), and open the setup link the server prints on
`http://localhost:5174` instead of :3000.

| Command               | What it does                                       |
| --------------------- | -------------------------------------------------- |
| `bun run dev`         | Starts the server, restarting on changes.          |
| `bun run recover`     | Issues a one-time token to register a new passkey. |
| `bun test`            | Runs the tests.                                    |
| `bun run check`       | Type-checks.                                       |
| `bun run db:generate` | Generates a migration after changing the schema.   |

Settings are environment variables, listed with their defaults in
[`.env.example`](.env.example).

## Deploying

Run these from the repository's root.

### Start

```sh
docker compose up -d --build
```

Or without Compose:

```sh
docker build -t syncvault .
docker run -d --name syncvault -p 3000:3000 \
  -v syncvault-data:/data --restart unless-stopped syncvault
```

The database is kept in the `syncvault-data` volume. The commands below use
plain Docker; with Compose, write `docker compose` instead of `docker`.

### Set up

```sh
docker logs syncvault
```

Open the setup link it prints and register a passkey. If you reach the server at
a different address, keep the `/setup#token=…` part and change the rest.

### HTTPS

Passkeys need HTTPS (or `localhost`). Put the server behind a reverse proxy that
handles HTTPS, and set these two variables (in `compose.yaml`, or with `-e` on
`docker run`):

```sh
PUBLIC_URL=https://sync.example.com
TRUST_PROXY=true
```

### Lost passkey

```sh
docker exec syncvault ./syncvault recover
```

Enter the token at **Lost your passkey?** on the sign-in page.

### Upgrade

```sh
git pull
docker compose up -d --build
```

### Back up

```sh
docker stop syncvault
docker run --rm -v syncvault-data:/data -v "$PWD":/backup alpine \
  sh -c 'cp /data/syncvault.sqlite* /backup/'
docker start syncvault
```

To restore, do the same with the copy reversed, and give the files back to the
server's user:

```sh
docker stop syncvault
docker run --rm -v syncvault-data:/data -v "$PWD":/backup alpine \
  sh -c 'rm -f /data/syncvault.sqlite* &&
    cp /backup/syncvault.sqlite* /data/ && chown -R 65532:65532 /data'
docker start syncvault
```
