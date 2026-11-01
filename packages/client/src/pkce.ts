// PKCE (RFC 7636) with the S256 method, using Web Crypto so it runs in the
// browser.

function base64url(bytes: Uint8Array) {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary)
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replace(/=+$/, '');
}

/** A random, URL-safe string with 256 bits of entropy. */
export function randomString() {
	return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function createPkce() {
	const verifier = randomString();
	const hash = await crypto.subtle.digest(
		'SHA-256',
		new TextEncoder().encode(verifier)
	);
	return { verifier, challenge: base64url(new Uint8Array(hash)) };
}
