import { ApiError, api, call, signInUrl } from '#lib/api.ts';
import type { LayoutLoad } from './$types';
import { redirect } from '@sveltejs/kit';

// Every dashboard page needs the owner signed in. The passkeys are loaded
// here since the account menu counts them.
export const load: LayoutLoad = async ({ url }) => {
	try {
		return { passkeys: await call(api.admin.passkeys.get()) };
	} catch (cause) {
		if (cause instanceof ApiError && cause.status === 401) {
			redirect(307, signInUrl(url));
		}
		throw cause;
	}
};
