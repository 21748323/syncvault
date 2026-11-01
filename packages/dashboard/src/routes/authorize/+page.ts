import { ApiError, api, call, signInUrl } from '#lib/api.ts';
import type { PageLoad } from './$types';
import { redirect } from '@sveltejs/kit';

// Where /oauth/authorize sends a valid request, with the same query. A
// signed-out owner signs in first, and /login brings them back here.
export const load: PageLoad = async ({ url }) => {
	const params = Object.fromEntries(url.searchParams);
	const result = await call(api.oauth.request.get({ query: params })).then(
		(request) => ({ request, problem: null }),
		(cause) => ({
			request: null,
			problem:
				cause instanceof ApiError ? cause.message : 'Something went wrong.',
		})
	);
	// Outside the catch above: redirect() works by throwing.
	if (result.request && !result.request.signedIn) {
		redirect(307, signInUrl(url));
	}
	return { params, ...result };
};
