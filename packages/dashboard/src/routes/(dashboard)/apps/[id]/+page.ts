import { ApiError, api, call } from '#lib/api.ts';
import type { PageLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageLoad = async ({ params, parent }) => {
	await parent();
	try {
		return { app: await call(api.admin.apps({ id: params.id }).get()) };
	} catch (cause) {
		if (cause instanceof ApiError && cause.status === 404) {
			error(404, 'This app was deleted, or never existed.');
		}
		throw cause;
	}
};
