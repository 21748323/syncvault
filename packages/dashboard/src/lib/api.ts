import { goto } from '$app/navigation';
import { treaty } from '@elysiajs/eden';
import type { App } from '@syncvault/server/src/app.ts';

/** The server's JSON API, typed from its routes. Same origin, so the session
 * cookie goes along. */
export const api = treaty<App>(location.origin).api;

export class ApiError extends Error {
	constructor(
		readonly status: number,
		message: string
	) {
		super(message);
	}
}

/**
 * Unwraps an API call: its data, or an ApiError with the server's message.
 * Routes that can return a raw Response (OAuth's errors) only do so with an
 * error status, so it's never the data.
 */
export async function call<
	R extends {
		data: unknown;
		error: { status: unknown; value: unknown } | null;
	},
>(request: Promise<R>): Promise<Exclude<NonNullable<R['data']>, Response>> {
	const { data, error } = await request;
	if (!error) return data as Exclude<NonNullable<R['data']>, Response>;
	throw new ApiError(Number(error.status), errorMessage(error.value));
}

/** Where to sign in, coming back to the current page afterwards. */
export const signInUrl = (from: URL | Location) =>
	`/login?next=${encodeURIComponent(from.pathname + from.search)}`;

// Errors are plain text, except OAuth's JSON and validation's JSON.
function errorMessage(value: unknown) {
	if (typeof value === 'string' && value) return value;
	if (value && typeof value === 'object') {
		const body = value as { error_description?: string; message?: string };
		if (body.error_description) return body.error_description;
	}
	return 'Something went wrong. Try again.';
}

/**
 * A readable message for anything a dashboard action threw. If the session
 * has ended, it also goes to sign in.
 */
export function describe(cause: unknown) {
	if (cause instanceof DOMException && cause.name === 'NotAllowedError') {
		return 'The passkey prompt was cancelled or timed out.';
	}
	// Registration excludes the passkeys already registered.
	if (cause instanceof DOMException && cause.name === 'InvalidStateError') {
		return 'That device already has a passkey for this server. Choose another device or a security key.';
	}
	if (cause instanceof ApiError) {
		if (cause.status === 401 && location.pathname !== '/login') {
			// The page to come back to isn't a route known when this is written.
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			void goto(signInUrl(location));
		}
		return cause.message;
	}
	return 'Something went wrong. Try again.';
}
