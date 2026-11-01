import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { randomToken } from './crypto.ts';
import { createDb } from './db/index.ts';
import { recover } from './recover.ts';
import { createServices } from './services.ts';

// `syncvault recover`: the Docker image's binary has no `bun run recover`.
if (process.argv[2] === 'recover') process.exit(recover());

const config = loadConfig();
const db = createDb(config.databaseFile);
const setupToken = config.setupToken ?? randomToken();
const services = createServices(db, config, setupToken);
const app = createApp(services).listen(config.port);

console.log(`SyncVault listening on ${app.server?.url}`);
if (!services.owner.isSetupComplete()) {
	const url = config.publicUrl ?? app.server!.url.origin;
	console.log(`Setup isn't complete. Setup token: ${setupToken}`);
	// In the fragment, so the token never reaches the server or proxy logs.
	console.log(`Set up at ${url}/setup#token=${encodeURIComponent(setupToken)}`);
}

function deleteExpired() {
	services.owner.deleteExpired();
	services.oauth.deleteExpired();
}
deleteExpired();
setInterval(deleteExpired, 60 * 60 * 1000);
