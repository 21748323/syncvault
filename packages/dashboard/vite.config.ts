import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// In development, this server is the front door: it proxies the API to the
// SyncVault server on :3000, keeping the Host header, so passkeys, the session
// cookie and the OAuth issuer all belong to this origin. Connect apps to
// http://localhost:5174 so consent works too.
const server = 'http://localhost:3000';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
			},
			// The server sends every path without a file to the fallback.
			adapter: adapter({ fallback: '200.html' }),
		}),
	],
	server: {
		port: 5174,
		strictPort: true,
		proxy: Object.fromEntries(
			['/api', '/oauth', '/.well-known'].map((path) => [
				path,
				{ target: server, changeOrigin: false },
			])
		),
	},
});
