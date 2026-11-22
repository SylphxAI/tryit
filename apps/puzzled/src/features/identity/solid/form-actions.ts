import { createSignal } from 'solid-js'
import { POLICY_ACCEPTANCE } from '@/lib/identity/policy-consent'

type Endpoint =
	| 'login'
	| 'sign-in'
	| 'oidc/begin'
	| 'recovery'
	| 'recovery/complete'
	| 'verify-email'
	| 'verify-email/resend'

export async function postIdentity(endpoint: Endpoint, data: object) {
	const response = await fetch(`/api/identity/${endpoint}`, {
		method: 'POST',
		credentials: 'same-origin',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(data),
	})
	const body: unknown = await response.json().catch(() => null)
	return {
		ok: response.ok,
		retryAfter: response.headers.get('retry-after'),
		body: body && typeof body === 'object' ? (body as Record<string, unknown>) : {},
	}
}

/** A Solid signal changes synchronously: a second submit cannot race the first render. */
export function createIdentityAction() {
	const [pending, setPending] = createSignal(false)
	const [error, setError] = createSignal<string | null>(null)
	const [loadingProvider, setLoadingProvider] = createSignal<string | null>(null)
	async function run(action: () => Promise<void>, fallback: string) {
		if (pending()) return
		setPending(true)
		setError(null)
		try {
			await action()
		} catch (cause) {
			setError(cause instanceof IdentityRefusal ? cause.message : fallback)
		} finally {
			setLoadingProvider(null)
			setPending(false)
		}
	}
	function oauth(provider: string, redirectUrl: string, acceptPolicy = false) {
		return run(async () => {
			setLoadingProvider(provider)
			const result = await postIdentity('oidc/begin', {
				provider,
				redirectUrl,
				...(acceptPolicy ? { acceptance: POLICY_ACCEPTANCE } : {}),
			})
			if (
				!result.ok ||
				typeof result.body.authorizationUrl !== 'string' ||
				!result.body.authorizationUrl
			)
				throw new IdentityRefusal('oidc_begin_failed')
			window.location.assign(result.body.authorizationUrl)
		}, 'oidc_begin_failed')
	}
	return { pending, error, clearError: () => setError(null), loadingProvider, run, oauth }
}

export class IdentityRefusal extends Error {}

export async function signIn(email: string, password: string, destination: string) {
	const result = await postIdentity('login', { email, password })
	if (!result.ok) throw new IdentityRefusal('sign_in_failed')
	window.location.assign(destination)
}

export async function recover(email: string) {
	const result = await postIdentity('recovery', { email })
	if (!result.ok) throw new IdentityRefusal('recovery_failed')
}

export async function reset(challengeId: string, secret: string, password: string) {
	const result = await postIdentity('recovery/complete', { challengeId, secret, password })
	if (!result.ok)
		throw new IdentityRefusal(
			typeof result.body.error === 'string' ? result.body.error : 'reset_failed',
		)
}
