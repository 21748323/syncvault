import type {
	AuthenticationResponseJSON,
	PublicKeyCredentialCreationOptionsJSON,
	PublicKeyCredentialRequestOptionsJSON,
	RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { isoBase64URL, isoCBOR } from '@simplewebauthn/server/helpers';

// A software passkey for tests: it builds real WebAuthn responses (P-256,
// "none" attestation), so the server's verification runs as it would against
// a browser.

const encoder = new TextEncoder();

async function sha256(data: Uint8Array<ArrayBuffer>) {
	return new Uint8Array(await crypto.subtle.digest('SHA-256', data));
}

function concat(...parts: Uint8Array[]) {
	const result = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
	let offset = 0;
	for (const part of parts) {
		result.set(part, offset);
		offset += part.length;
	}
	return result;
}

function uint32(value: number) {
	const bytes = new Uint8Array(4);
	new DataView(bytes.buffer).setUint32(0, value);
	return bytes;
}

// WebCrypto signs as r || s, but WebAuthn's ES256 signatures are DER.
function derSignature(raw: Uint8Array) {
	function integer(bytes: Uint8Array) {
		let start = 0;
		while (start < bytes.length - 1 && bytes[start] === 0) start++;
		const trimmed = bytes.slice(start);
		const value =
			trimmed[0]! & 0x80 ? concat(new Uint8Array([0]), trimmed) : trimmed;
		return concat(new Uint8Array([0x02, value.length]), value);
	}
	const body = concat(integer(raw.slice(0, 32)), integer(raw.slice(32)));
	return concat(new Uint8Array([0x30, body.length]), body);
}

// User present, user verified, and (for registration) attested credential
// data included.
const UP_UV = 0x05;
const AT = 0x40;

/** A passkey for `origin`, as a browser on one device would hold it. */
export async function createTestPasskey(origin = 'http://localhost:3000') {
	const keys = await crypto.subtle.generateKey(
		{ name: 'ECDSA', namedCurve: 'P-256' },
		true,
		['sign', 'verify']
	);
	const credentialId = crypto.getRandomValues(new Uint8Array(16));
	const id = isoBase64URL.fromBuffer(credentialId);
	const rpIdHash = await sha256(encoder.encode(new URL(origin).hostname));
	let counter = 0;
	let userHandle: string | undefined;

	function clientData(type: string, challenge: string) {
		return encoder.encode(
			JSON.stringify({ type, challenge, origin, crossOrigin: false })
		);
	}

	return {
		id,

		/**
		 * navigator.credentials.create(), then toJSON(). Takes the JSON an
		 * options route returned.
		 */
		async register(json: unknown): Promise<RegistrationResponseJSON> {
			const options = json as PublicKeyCredentialCreationOptionsJSON;
			userHandle = options.user.id;
			const jwk = await crypto.subtle.exportKey('jwk', keys.publicKey);
			const coseKey = isoCBOR.encode(
				new Map<number, number | Uint8Array>([
					[1, 2], // kty: EC2
					[3, -7], // alg: ES256
					[-1, 1], // crv: P-256
					[-2, isoBase64URL.toBuffer(jwk.x!)],
					[-3, isoBase64URL.toBuffer(jwk.y!)],
				])
			);
			const authData = concat(
				rpIdHash,
				new Uint8Array([UP_UV | AT]),
				uint32(counter),
				new Uint8Array(16), // AAGUID
				new Uint8Array([0, credentialId.length]),
				credentialId,
				coseKey
			);
			const attestationObject = isoCBOR.encode(
				new Map<string, unknown>([
					['fmt', 'none'],
					['attStmt', new Map()],
					['authData', authData],
				]) as Parameters<typeof isoCBOR.encode>[0]
			);
			return {
				id,
				rawId: id,
				type: 'public-key',
				response: {
					clientDataJSON: isoBase64URL.fromBuffer(
						clientData('webauthn.create', options.challenge)
					),
					attestationObject: isoBase64URL.fromBuffer(attestationObject),
					transports: ['internal'],
				},
				clientExtensionResults: {},
			};
		},

		/** navigator.credentials.get(), then toJSON(). */
		async authenticate(json: unknown): Promise<AuthenticationResponseJSON> {
			const options = json as PublicKeyCredentialRequestOptionsJSON;
			counter++;
			const authData = concat(
				rpIdHash,
				new Uint8Array([UP_UV]),
				uint32(counter)
			);
			const clientDataJSON = clientData('webauthn.get', options.challenge);
			const signed = concat(authData, await sha256(clientDataJSON));
			const signature = new Uint8Array(
				await crypto.subtle.sign(
					{ name: 'ECDSA', hash: 'SHA-256' },
					keys.privateKey,
					signed
				)
			);
			return {
				id,
				rawId: id,
				type: 'public-key',
				response: {
					clientDataJSON: isoBase64URL.fromBuffer(clientDataJSON),
					authenticatorData: isoBase64URL.fromBuffer(authData),
					signature: isoBase64URL.fromBuffer(derSignature(signature)),
					userHandle,
				},
				clientExtensionResults: {},
			};
		},
	};
}

export type TestPasskey = Awaited<ReturnType<typeof createTestPasskey>>;
