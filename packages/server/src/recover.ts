// `bun run recover` (or `syncvault recover` in the Docker image): issues a
// one-time token for registering a new passkey when the owner has lost theirs.
// Being able to run it on the server is the proof of ownership. Safe to run
// while the server is up.
import { createOwnerAuth } from './auth/owner.ts';
import { loadConfig } from './config.ts';
import { createDb } from './db/index.ts';

/** Returns the exit code. */
export function recover() {
	const config = loadConfig();
	// No setup token is needed: this only issues recovery tokens.
	const owner = createOwnerAuth(createDb(config.databaseFile), '');
	const issued = owner.issueRecoveryToken();

	if (!issued) {
		console.log(
			"Setup isn't complete, so there's nothing to recover. Start the server and use the setup token it prints."
		);
		return 1;
	}

	console.log(`Recovery token: ${issued.token}`);
	console.log(`Expires: ${issued.expiresAt.toLocaleString()}`);
	console.log(
		'Enter it at "Lost your passkey?" when signing in. Registering a new passkey with it removes all the others and signs out every session.'
	);
	return 0;
}

if (import.meta.main) process.exit(recover());
