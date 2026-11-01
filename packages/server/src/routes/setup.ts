import { version } from '../../package.json';
import type { Services } from '../services.ts';
import { relyingParty, requireJsonBody, setSessionCookie } from './session.ts';
import { passkeyName, registrationResponse } from './shared.ts';
import { Elysia, t } from 'elysia';

// Claiming the instance with a token from the terminal: the setup token at
// first run, or a recovery token after the owner has lost their passkeys.
// Both register a passkey, so each is two requests (options, then the
// browser's response).
export function setupRoutes(services: Services) {
	const { owner } = services;
	return (
		new Elysia({ prefix: '/api' })
			// Lets clients check that a URL is a SyncVault server. `url` is where
			// apps connect, and whose host passkeys are bound to.
			.get('/info', ({ request }) => ({
				name: 'SyncVault',
				version,
				url: relyingParty(services, request).origin,
				setupComplete: owner.isSetupComplete(),
			}))
			.onBeforeHandle(requireJsonBody)
			.post(
				'/setup/options',
				async ({ body, request, status }) => {
					const result = await owner.setupOptions(
						relyingParty(services, request),
						body.setupToken
					);
					if (result === 'already_complete') {
						return status(409, 'Setup is already complete');
					}
					if (result === 'invalid_token') {
						return status(403, 'Wrong setup token');
					}
					return result;
				},
				{ body: t.Object({ setupToken: t.String() }) }
			)
			.post(
				'/setup',
				async ({ body, cookie, request, status }) => {
					const result = await owner.setup(
						relyingParty(services, request),
						body.setupToken,
						body.response,
						body.name
					);
					if (result === 'already_complete') {
						return status(409, 'Setup is already complete');
					}
					if (result === 'invalid_token') {
						return status(403, 'Wrong setup token');
					}
					if (result === 'invalid_response') {
						return status(400, "The passkey couldn't be verified");
					}
					setSessionCookie(cookie, result.session, services, request);
					return status(201);
				},
				{
					body: t.Object({
						setupToken: t.String(),
						response: registrationResponse,
						name: t.Optional(passkeyName),
					}),
				}
			)
			.post(
				'/recover/options',
				async ({ body, request, status }) => {
					const result = await owner.recoverOptions(
						relyingParty(services, request),
						body.recoveryToken
					);
					if (result === 'invalid_token') {
						return status(403, 'Wrong or expired recovery token');
					}
					return result;
				},
				{ body: t.Object({ recoveryToken: t.String() }) }
			)
			.post(
				'/recover',
				async ({ body, cookie, request, status }) => {
					const result = await owner.recover(
						relyingParty(services, request),
						body.recoveryToken,
						body.response,
						body.name
					);
					if (result === 'invalid_token') {
						return status(403, 'Wrong or expired recovery token');
					}
					if (result === 'invalid_response') {
						return status(400, "The passkey couldn't be verified");
					}
					setSessionCookie(cookie, result.session, services, request);
					return status(204);
				},
				{
					body: t.Object({
						recoveryToken: t.String(),
						response: registrationResponse,
						name: t.Optional(passkeyName),
					}),
				}
			)
	);
}
