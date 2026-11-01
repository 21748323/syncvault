import { timingSafeEqual } from 'node:crypto';

/** A random, URL-safe token with 256 bits of entropy. */
export function randomToken() {
	return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString(
		'base64url'
	);
}

/** How tokens are stored, so the database never holds a usable token. */
export function hashToken(token: string) {
	return new Bun.CryptoHasher('sha256').update(token).digest('hex');
}

/** PKCE with the S256 method (RFC 7636). */
export function verifyPkce(verifier: string, challenge: string) {
	const hash = new Bun.CryptoHasher('sha256').update(verifier).digest();
	return safeEqual(Buffer.from(hash).toString('base64url'), challenge);
}

/** Compares secrets without leaking where they differ through timing. */
export function safeEqual(a: string, b: string) {
	const bufferA = Buffer.from(a);
	const bufferB = Buffer.from(b);
	return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
}
