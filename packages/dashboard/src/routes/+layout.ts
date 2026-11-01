import { api, call } from '#lib/api.ts';
import type { LayoutLoad } from './$types';
import { redirect } from '@sveltejs/kit';

// A static SPA, served by the SyncVault server.
export const ssr = false;

// Rerun on each navigation (it reads the path), so setupComplete stays fresh.
export const load: LayoutLoad = async ({ url }) => {
	const info = await call(api.info.get());
	if (!info.setupComplete && url.pathname !== '/setup') redirect(307, '/setup');
	return { info };
};
