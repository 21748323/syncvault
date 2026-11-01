import type { RelyingParty } from '../auth/passkeys.ts';
import type { Services } from '../services.ts';
import { type Cookie, Elysia } from 'elysia';

// The owner's session cookie, used by the dashboard (served from this server)
// and when approving apps. Apps themselves use bearer tokens instead.
export const SESSION_COOKIE = 'syncvault_session';

export function ownerSession({ owner }: Services) {
	return new Elysia().macro({
		/** Requires a signed-in owner, and provides `owner` and `sessionToken`. */
		owner: {
			resolve({ cookie, status }) {
				const sessionToken = cookie[SESSION_COOKIE]?.value;
				const account =
					typeof sessionToken === 'string'
						? owner.getOwner(sessionToken)
						: undefined;
				if (!account) return status(401, 'Sign in first');
				return { owner: account, sessionToken: sessionToken as string };
			},
		},
	});
}

export function setSessionCookie(
	cookie: Record<string, Cookie<unknown>>,
	session: { token: string; expiresAt: Date },
	{ config }: Services,
	request: Request
) {
	cookie[SESSION_COOKIE]!.set({
		value: session.token,
		expires: session.expiresAt,
		httpOnly: true,
		sameSite: 'lax',
		secure: new URL(config.publicUrl ?? request.url).protocol === 'https:',
		path: '/',
	});
}

/**
 * Passkeys are bound to the host users reach the server at, and only accepted
 * from its origin.
 */
export function relyingParty(
	{ config }: Services,
	request: Request
): RelyingParty {
	const url = new URL(config.publicUrl ?? request.url);
	return { id: url.hostname, origin: url.origin };
}

// Elysia's cookie.remove() leaves out the path, which would make the browser
// clear a different cookie than the one setSessionCookie set.
export function clearSessionCookie(cookie: Record<string, Cookie<unknown>>) {
	cookie[SESSION_COOKIE]!.set({
		value: '',
		expires: new Date(0),
		maxAge: 0,
		httpOnly: true,
		sameSite: 'lax',
		path: '/',
	});
}

/**
 * Cookie routes only accept JSON bodies. SameSite=Lax already keeps the cookie
 * off cross-site POSTs, but "site" includes sibling subdomains, and other
 * origins can't send JSON without a CORS preflight, which these routes fail.
 */
export function requireJsonBody({
	request,
	status,
}: {
	request: Request;
	status: (code: 415, message: string) => unknown;
}) {
	if (!['POST', 'PUT', 'PATCH'].includes(request.method)) return;
	const type = request.headers.get('content-type') ?? '';
	if (!type.startsWith('application/json')) {
		return status(415, 'Expected a JSON body');
	}
}
