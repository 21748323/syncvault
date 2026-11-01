import { OAuthError, parseAuthorizeRequest } from '../auth/oauth.ts';
import type { Services } from '../services.ts';
import { SESSION_COOKIE, ownerSession, requireJsonBody } from './session.ts';
import { Elysia, t } from 'elysia';

// OAuth errors are JSON with error and error_description (RFC 6749 §5.2).
function oauthError(error: unknown) {
	if (!(error instanceof OAuthError)) throw error;
	return Response.json(
		{ error: error.error, error_description: error.description },
		{ status: 400, headers: { 'cache-control': 'no-store' } }
	);
}

function stringParam(params: Record<string, unknown>, name: string) {
	const value = params[name];
	if (typeof value !== 'string' || !value) {
		throw new OAuthError('invalid_request', `${name} is required`);
	}
	return value;
}

export function oauthRoutes(services: Services) {
	const { owner, oauth, config } = services;

	return (
		new Elysia()
			.use(ownerSession(services))
			.get('/.well-known/oauth-authorization-server', ({ request }) => {
				const issuer = config.publicUrl ?? new URL(request.url).origin;
				return {
					issuer,
					authorization_endpoint: `${issuer}/oauth/authorize`,
					token_endpoint: `${issuer}/oauth/token`,
					revocation_endpoint: `${issuer}/oauth/revoke`,
					response_types_supported: ['code'],
					grant_types_supported: ['authorization_code', 'refresh_token'],
					code_challenge_methods_supported: ['S256'],
					token_endpoint_auth_methods_supported: ['none'],
				};
			})
			// Where apps send the browser. A valid request continues to the
			// dashboard's sign-in and consent screen. An invalid one is never
			// redirected back, since its redirect_uri can't be trusted.
			.get('/oauth/authorize', ({ query, request, redirect }) => {
				try {
					parseAuthorizeRequest(query);
				} catch (error) {
					return oauthError(error);
				}
				return redirect(`/authorize${new URL(request.url).search}`);
			})
			// What the consent screen shows: who's asking, and whether the owner
			// needs to sign in first.
			.get('/api/oauth/request', ({ query, cookie }) => {
				let request;
				try {
					request = parseAuthorizeRequest(query);
				} catch (error) {
					return oauthError(error);
				}
				const sessionToken = cookie[SESSION_COOKIE]?.value;
				const registered = oauth.findApp(request.clientId);
				return {
					setupComplete: owner.isSetupComplete(),
					signedIn:
						typeof sessionToken === 'string' &&
						owner.getOwner(sessionToken) !== undefined,
					app: {
						clientId: request.clientId,
						// Claimed by the app, so the origin is what to trust.
						name: request.appName ?? null,
						registeredName: registered?.name ?? null,
						// Devices it already has, so a new one can be told apart.
						devices: registered ? oauth.deviceCount(registered.id) : 0,
					},
					deviceName: request.deviceName ?? null,
				};
			})
			.onBeforeHandle(requireJsonBody)
			// The owner's decision. Returns where the consent screen should send
			// the browser.
			.post(
				'/api/oauth/authorize',
				({ body }) => {
					let request;
					try {
						request = parseAuthorizeRequest(body);
					} catch (error) {
						return oauthError(error);
					}
					return {
						redirectTo: body.approve
							? oauth.approve(request)
							: oauth.deny(request),
					};
				},
				{
					owner: true,
					body: t.Object(
						{ approve: t.Boolean() },
						{ additionalProperties: true }
					),
				}
			)
	);
}

// Called by apps, cross-origin. Accept form bodies (the OAuth standard) and
// JSON alike.
export function oauthTokenRoutes({ oauth, events }: Services) {
	return (
		new Elysia({ prefix: '/oauth' })
			.post('/token', ({ body, set }) => {
				set.headers['cache-control'] = 'no-store';
				const params = (body ?? {}) as Record<string, unknown>;
				try {
					switch (params.grant_type) {
						case 'authorization_code':
							return oauth.exchangeCode({
								code: stringParam(params, 'code'),
								clientId: stringParam(params, 'client_id'),
								redirectUri: stringParam(params, 'redirect_uri'),
								codeVerifier: stringParam(params, 'code_verifier'),
							});
						case 'refresh_token':
							return oauth.refresh({
								refreshToken: stringParam(params, 'refresh_token'),
								clientId: stringParam(params, 'client_id'),
							});
						default:
							throw new OAuthError(
								'unsupported_grant_type',
								'grant_type must be authorization_code or refresh_token'
							);
					}
				} catch (error) {
					return oauthError(error);
				}
			})
			// Signs the device out. Always succeeds, even for an unknown token
			// (RFC 7009).
			.post('/revoke', ({ body, status }) => {
				const token = (body as Record<string, unknown> | undefined)?.token;
				if (typeof token === 'string') {
					const deviceId = oauth.revoke(token);
					if (deviceId !== undefined) events.closeDevice(deviceId);
				}
				return status(200, '');
			})
	);
}
