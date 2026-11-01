import type {
	AuthenticationResponseJSON,
	RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { t } from 'elysia';

// The browser's credential.toJSON(). Only the outline is checked here:
// SimpleWebAuthn validates the rest, and extra fields (e.g. transports) must
// survive.
const credentialJson = {
	id: t.String({ maxLength: 1024 }),
	rawId: t.String({ maxLength: 1024 }),
	type: t.Literal('public-key'),
	clientExtensionResults: t.Optional(
		t.Object({}, { additionalProperties: true })
	),
};

export const registrationResponse = t.Unsafe<RegistrationResponseJSON>(
	t.Object(
		{
			...credentialJson,
			response: t.Object(
				{ clientDataJSON: t.String(), attestationObject: t.String() },
				{ additionalProperties: true }
			),
		},
		{ additionalProperties: true }
	)
);

export const authenticationResponse = t.Unsafe<AuthenticationResponseJSON>(
	t.Object(
		{
			...credentialJson,
			response: t.Object(
				{
					clientDataJSON: t.String(),
					authenticatorData: t.String(),
					signature: t.String(),
				},
				{ additionalProperties: true }
			),
		},
		{ additionalProperties: true }
	)
);

export const passkeyName = t.String({ minLength: 1, maxLength: 64 });

export const collectionName = t.String({ pattern: '^[\\w-]{1,64}$' });
