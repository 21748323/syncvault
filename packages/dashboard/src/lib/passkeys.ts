import { api, call } from '#lib/api.ts';

// WebAuthn in the browser. Each ceremony is two API calls: the server's options
// go to the browser, and the browser's credential (`toJSON()`) goes back.

// The credential JSON the API takes. The browser's own types differ slightly
// (plain strings for enums); SimpleWebAuthn validates it on the server.
type Registration = Parameters<typeof api.setup.post>[0]['response'];
type Authentication = Parameters<typeof api.admin.login.post>[0]['response'];

export const passkeysSupported = () =>
	typeof PublicKeyCredential !== 'undefined' &&
	'parseCreationOptionsFromJSON' in PublicKeyCredential;

/** Creates a passkey from registration options, for setup, recovery or adding
 * another. */
export async function createCredential(options: unknown) {
	const credential = (await navigator.credentials.create({
		publicKey: PublicKeyCredential.parseCreationOptionsFromJSON(
			options as PublicKeyCredentialCreationOptionsJSON
		),
	})) as PublicKeyCredential;
	return credential.toJSON() as unknown as Registration;
}

/** Signs in with whichever passkey the browser offers. */
export async function getCredential(options: unknown) {
	const credential = (await navigator.credentials.get({
		publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(
			options as PublicKeyCredentialRequestOptionsJSON
		),
	})) as PublicKeyCredential;
	return credential.toJSON() as unknown as Authentication;
}

/** Signs the owner in with whichever passkey the browser offers, setting the
 * session cookie. */
export async function signIn() {
	const options = await call(api.admin.login.options.post({}));
	const response = await getCredential(options);
	await call(api.admin.login.post({ response }));
}
