import { api, call } from '#lib/api.ts';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent }) => {
	await parent();
	return { apps: await call(api.admin.apps.get()) };
};
