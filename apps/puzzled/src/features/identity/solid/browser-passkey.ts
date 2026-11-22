import type { PasskeyProof } from '@/lib/identity/client-auth'
import { IdentityRefusal, postIdentity } from './form-actions'

export function supportsPasskeys() {
	return (
		typeof window !== 'undefined' &&
		window.isSecureContext &&
		typeof PublicKeyCredential !== 'undefined' &&
		typeof navigator.credentials?.get === 'function'
	)
}

function encode(buffer: ArrayBuffer) {
	return btoa(String.fromCharCode(...new Uint8Array(buffer)))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '')
}

function decode(value: string) {
	return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (ch) =>
		ch.charCodeAt(0),
	)
}

export async function getPasskey(
	signal: AbortSignal,
	conditional = false,
): Promise<PasskeyProof | null> {
	const result = await postIdentity('sign-in', { step: 'passkey-start' })
	if (signal.aborted) return null
	const challenge = result.body
	if (
		!result.ok ||
		typeof challenge.challengeId !== 'string' ||
		typeof challenge.challenge !== 'string' ||
		challenge.rpId !== window.location.hostname ||
		typeof challenge.expiresAt !== 'number' ||
		challenge.expiresAt * 1000 <= Date.now() ||
		!Array.isArray(challenge.credentialIds)
	)
		throw new IdentityRefusal('passkey_unavailable')

	const credential = await navigator.credentials.get({
		mediation: conditional ? 'conditional' : 'required',
		signal,
		publicKey: {
			rpId: challenge.rpId,
			challenge: decode(challenge.challenge),
			timeout: Math.min(120_000, challenge.expiresAt * 1000 - Date.now()),
			userVerification: 'required',
			allowCredentials: challenge.credentialIds.map((id: string) => ({
				type: 'public-key',
				id: decode(id),
			})),
		},
	})
	if (signal.aborted || !credential) return null
	if (
		!(credential instanceof PublicKeyCredential) ||
		!(credential.response instanceof AuthenticatorAssertionResponse)
	) {
		throw new IdentityRefusal('passkey_unavailable')
	}
	const { response } = credential
	return {
		challenge_id: challenge.challengeId,
		credential_id: encode(credential.rawId),
		client_data_json: encode(response.clientDataJSON),
		authenticator_data: encode(response.authenticatorData),
		signature: encode(response.signature),
		user_handle: response.userHandle ? encode(response.userHandle) : '',
	}
}
