import 'server-only'

import { destIdentityProjectId } from './credentials'
import { authIdValue, destIdentityOrigin } from './dest'
import { isPolicyAcceptance, type PolicyAcceptance } from './policy-consent'

export { safeNext } from './return-path'

/**
 * Tryit's players are end users of its own Sylphx Auth instance, reached
 * through the Auth client API in server mode:
 *
 * - password sign-in: `POST /v1/client/sign-in/password` → one-time ticket;
 * - Google: the verified tenant portal or shared Auth starts OAuth and
 *   returns to our callback with a one-time ticket;
 * - every ticket is redeemed here with the secret key
 *   (`POST /v1/client/tickets:redeem`), so a session token never enters a URL
 *   or the browser's JavaScript.
 *
 * Auth binds a session to the browser's User-Agent, so every call made on a
 * player's behalf forwards it. Keys and origin come from the Enable Auth binding:
 * `SYLPHX_PUBLISHABLE_KEY`, `SYLPHX_AUTH_SECRET_KEY`, and `SYLPHX_AUTH_URL`.
 */

/** How long after an account is created a first sign-in still counts as new. */
export const NEW_USER_WINDOW_SECONDS = 600

export type AuthConfig = {
	url: string
	publishableKey: string
	secretKey: string
	instanceId?: string
}

function envValue(names: readonly string[], env: Record<string, string | undefined>) {
	for (const name of names) {
		const value = env[name]?.trim()
		if (value) return value
	}
	return undefined
}

/** The instance's keys, or null while Auth is not enabled for this environment. */
export function authConfig(
	env: Record<string, string | undefined> = process.env,
): AuthConfig | null {
	const publishableKey = envValue(['SYLPHX_PUBLISHABLE_KEY'], env)
	const secretKey = envValue(['SYLPHX_AUTH_SECRET_KEY'], env)
	if (!publishableKey || !secretKey) return null
	return {
		url: destIdentityOrigin(env.SYLPHX_AUTH_URL),
		publishableKey,
		secretKey,
		instanceId: destIdentityProjectId(env),
	}
}

export class AuthCallError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		readonly retryAfter: string | null = null,
	) {
		super(`auth ${status} ${code}`)
	}
}

async function call<T>(
	config: AuthConfig,
	path: string,
	init: {
		method?: string
		bearer: string
		userAgent: string
		body?: unknown
		callerKey?: string
	},
): Promise<T> {
	const response = await fetch(`${config.url}${path}`, {
		method: init.method ?? 'POST',
		headers: {
			authorization: `Bearer ${init.bearer}`,
			'user-agent': init.userAgent,
			...(init.callerKey ? { 'x-sylphx-caller-key': init.callerKey } : {}),
			...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
		},
		body: init.body === undefined ? undefined : JSON.stringify(init.body),
		cache: 'no-store',
		redirect: 'error',
		signal: AbortSignal.timeout(10_000),
	})
	const text = await response.text()
	let body: Record<string, unknown> = {}
	try {
		const parsed: unknown = text ? JSON.parse(text) : null
		if (parsed && typeof parsed === 'object') body = parsed as Record<string, unknown>
	} catch {
		body = {}
	}
	if (!response.ok) {
		// Auth answers `{ code, error: <message> }`: the code is the contract, the message is not.
		const code = typeof body.code === 'string' ? body.code : `http_${response.status}`
		throw new AuthCallError(response.status, code, response.headers.get('retry-after'))
	}
	return body as T
}

/** Password sign-in in server mode: a one-time ticket for this backend. */
export async function passwordTicket(
	config: AuthConfig,
	input: { email: string; password: string; userAgent: string },
): Promise<string> {
	const body = await call<{ ticket?: string }>(config, '/v1/client/sign-in/password', {
		bearer: config.publishableKey,
		userAgent: input.userAgent,
		body: { email: input.email, password: input.password, session_mode: 'server' },
	})
	return requireTicket(body)
}

export type RedeemedSession = {
	token: string
	/** Auth says the account was just created (`is_new_user`), when it says. */
	isNewUser?: boolean
}

/** Exchange a one-time ticket for a session, with the secret key. */
export async function redeemTicket(
	config: AuthConfig,
	ticket: string,
	userAgent: string,
): Promise<RedeemedSession> {
	const body = await call<{
		session?: { token?: string }
		is_new_user?: boolean
		isNewUser?: boolean
	}>(config, '/v1/client/tickets:redeem', {
		bearer: config.secretKey,
		userAgent,
		body: { ticket },
	})
	const token = body.session?.token
	if (!token) throw new AuthCallError(502, 'no_session')
	const flag = body.is_new_user ?? body.isNewUser
	return { token, isNewUser: typeof flag === 'boolean' ? flag : undefined }
}

/**
 * Was this sign-in the account's first? Auth's own flag wins; until Auth
 * sends it, an account created within the window before the session counts.
 */
export function isNewUser(input: {
	flag?: boolean
	principalCreatedAt?: number
	sessionCreatedAt?: number
	now: number
}): boolean {
	if (typeof input.flag === 'boolean') return input.flag
	if (!input.principalCreatedAt) return false
	const reference = input.sessionCreatedAt || input.now
	return reference - input.principalCreatedAt <= NEW_USER_WINDOW_SECONDS
}

/**
 * Creation times from `GET /v1/sessions/current` (seconds). None unless the
 * session belongs to this product's own Auth instance (`expectedProjectId`).
 */
export async function sessionTimes(
	config: AuthConfig,
	token: string,
	userAgent: string,
	expectedProjectId: string | undefined,
): Promise<{ principalCreatedAt?: number; sessionCreatedAt?: number }> {
	const body = await call<{
		session?: {
			created_at_unix_seconds?: number | string
			principal?: {
				created_at_unix_seconds?: number | string
				project_id?: string
				projectId?: string
			}
		}
	}>(config, '/v1/sessions/current', {
		method: 'GET',
		bearer: token,
		userAgent,
		// TODO: switch to the identity SDK's `callerKey` option once the published SDK supports it.
		callerKey: config.publishableKey,
	})
	const principal = body.session?.principal
	const expected = authIdValue(expectedProjectId)
	if (!expected || authIdValue(principal?.project_id ?? principal?.projectId) !== expected) {
		return {}
	}
	const num = (v: number | string | undefined) => (v === undefined ? undefined : Number(v))
	return {
		principalCreatedAt: num(body.session?.principal?.created_at_unix_seconds),
		sessionCreatedAt: num(body.session?.created_at_unix_seconds),
	}
}

/** Client API calls use only the published key, never a secret or a session credential. */
export function authClient<T>(config: AuthConfig, path: string, userAgent: string, body?: unknown) {
	return call<T>(config, `/v1/client/${path}`, {
		method: body === undefined ? 'GET' : 'POST',
		bearer: config.publishableKey,
		userAgent,
		body,
	})
}

/** Instance-wide client config, never an email/account eligibility lookup. */
async function readClientConfig(config: AuthConfig, userAgent: string) {
	const body = await authClient<{
		methods?: Record<string, unknown>
		social?: Array<{ provider?: unknown } | null>
	}>(config, 'config', userAgent)
	if (!Array.isArray(body?.social)) throw new AuthCallError(502, 'invalid_config')
	const providers = body.social.flatMap((entry) =>
		typeof entry?.provider === 'string' && entry.provider ? [entry.provider] : [],
	)
	return { methods: body.methods, providers }
}

export async function clientMethods(config: AuthConfig, userAgent = 'puzzled-web') {
	const { methods, providers } = await readClientConfig(config, userAgent)
	if (!methods || typeof methods !== 'object' || Array.isArray(methods)) {
		throw new AuthCallError(502, 'invalid_config')
	}
	return {
		emailCode: methods.email_otp === true,
		password: methods.password === true,
		passkey: methods.passkey === true,
		google: providers.includes('google'),
	}
}

/** Public Continue API; the browser never receives an Auth session or ticket. */
export async function beginEmailCode(config: AuthConfig, userAgent: string, email: string) {
	const body = await call<{ step?: unknown; flow?: unknown; expires_in?: unknown }>(
		config,
		'/v1/client/continue',
		{
			bearer: config.publishableKey,
			userAgent,
			body: { email, method: 'email_otp', session_mode: 'server' },
		},
	)
	if (
		body.step !== 'email_otp' ||
		typeof body.flow !== 'string' ||
		!/^[A-Za-z0-9_-]{43}$/.test(body.flow) ||
		typeof body.expires_in !== 'number' ||
		!Number.isInteger(body.expires_in) ||
		body.expires_in <= 0
	)
		throw new AuthCallError(502, 'invalid_continue')
	return { flow: body.flow, expiresIn: body.expires_in }
}

function requireTicket(body: { ticket?: unknown }) {
	if (typeof body.ticket !== 'string' || !body.ticket) throw new AuthCallError(502, 'no_ticket')
	return body.ticket
}

export async function emailCodeTicket(
	config: AuthConfig,
	userAgent: string,
	proof: { flow: string; code: string },
) {
	return requireTicket(
		await call<{ ticket?: unknown }>(config, '/v1/client/continue/verify', {
			bearer: config.publishableKey,
			userAgent,
			body: proof,
		}),
	)
}

export async function beginPasskey(config: AuthConfig, userAgent: string, origin: URL) {
	const rpId = origin.hostname
	const body = await call<{
		challenge_id?: unknown
		challenge?: unknown
		rp_id?: unknown
		allowed_credential_ids?: unknown
		expires_at?: unknown
	}>(config, '/v1/client/sign-in/passkey/begin', {
		bearer: config.publishableKey,
		userAgent,
		// No identifier hint: decide availability in the browser's authenticator.
		body: { rp_id: rpId, origin: origin.origin },
	})
	const { challenge_id, challenge, rp_id, allowed_credential_ids, expires_at } = body
	if (
		typeof challenge_id !== 'string' ||
		!challenge_id ||
		typeof challenge !== 'string' ||
		!/^[A-Za-z0-9_-]{22,512}$/.test(challenge) ||
		rp_id !== rpId ||
		!Array.isArray(allowed_credential_ids) ||
		!allowed_credential_ids.every(
			(id) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,2048}$/.test(id),
		) ||
		typeof expires_at !== 'number' ||
		!Number.isFinite(expires_at)
	)
		throw new AuthCallError(502, 'invalid_passkey_challenge')
	return {
		challengeId: challenge_id,
		challenge,
		rpId,
		credentialIds: allowed_credential_ids as string[],
		expiresAt: expires_at,
	}
}

export type PasskeyProof = {
	challenge_id: string
	credential_id: string
	client_data_json: string
	authenticator_data: string
	signature: string
	user_handle: string
}

export async function passkeyTicket(config: AuthConfig, userAgent: string, proof: PasskeyProof) {
	return requireTicket(
		await call<{ ticket?: unknown }>(config, '/v1/client/sign-in/passkey/verify', {
			bearer: config.publishableKey,
			userAgent,
			body: { ...proof, session_mode: 'server' },
		}),
	)
}

const GOOGLE_API_START = '/v1/client/oauth/google/start'
const GOOGLE_ORIGIN = 'https://accounts.google.com'
// Product-owned trust root. Neither a request header nor Auth's response sets it.
const TRYIT_AUTH_PORTAL = 'https://auth.tryit.fun'

/** Resolve the browser's next hop from this instance's live Auth settings. */
export async function googleStartUrl(
	config: AuthConfig,
	returnUrl: string,
	userAgent: string,
	acceptance?: PolicyAcceptance,
): Promise<string> {
	if (acceptance && !isPolicyAcceptance(acceptance))
		throw new AuthCallError(400, 'policy_acceptance_required')
	const settings = await authClient<{
		instance?: { id?: unknown; slug?: unknown }
		portal_origin_mode?: unknown
		portal_url?: unknown
		social?: Array<{ provider?: unknown; credentials?: unknown; start_url?: unknown } | null>
	}>(config, 'config', userAgent)
	const expectedId = authIdValue(config.instanceId)
	const { id, slug } = settings.instance ?? {}
	if (!expectedId || typeof id !== 'string' || authIdValue(id) !== expectedId)
		throw new AuthCallError(503, 'identity_unconfigured')
	if (!Array.isArray(settings.social)) throw new AuthCallError(502, 'invalid_config')
	const [google, duplicate] = settings.social.filter((entry) => entry?.provider === 'google')
	if (!google) throw new AuthCallError(403, 'oidc_provider_unavailable')
	if (duplicate) throw new AuthCallError(502, 'invalid_config')

	const hosted =
		typeof slug === 'string' && /^[a-z0-9][a-z0-9-]{0,62}$/.test(slug)
			? new URL(`/oauth/google/start?instance=${slug}`, TRYIT_AUTH_PORTAL)
			: null
	const withCallback = (start: URL) => {
		start.searchParams.set('redirect_url', returnUrl)
		start.searchParams.set('session_mode', 'server')
		return start
	}
	const withAcceptance = (start: URL) => {
		if (acceptance) {
			for (const [key, value] of Object.entries(acceptance))
				start.searchParams.set(key, String(value))
		}
		return start.href
	}
	if (google.credentials === 'custom') {
		if (
			!hosted ||
			settings.portal_origin_mode !== 'hosted' ||
			settings.portal_url !== TRYIT_AUTH_PORTAL ||
			google.start_url !== hosted.href
		)
			throw new AuthCallError(503, 'identity_unconfigured')
		return withAcceptance(withCallback(hosted))
	}

	// A shared start always uses the server binding. Discovery's advertised
	// URL is neither a credential destination nor a browser redirect.
	const shared = new URL(GOOGLE_API_START, config.url)
	if (
		google.credentials !== 'shared' &&
		(google.credentials !== undefined ||
			(google.start_url !== undefined && google.start_url !== shared.href))
	)
		throw new AuthCallError(503, 'identity_unconfigured')
	const response = await fetch(withAcceptance(withCallback(shared)), {
		headers: { authorization: `Bearer ${config.publishableKey}`, 'user-agent': userAgent },
		cache: 'no-store',
		redirect: 'manual',
		signal: AbortSignal.timeout(8_000),
	})
	const location = response.headers.get('location')
	await response.body?.cancel()
	if (response.status === 303 && location) {
		// Activation can race the settings read. Accept only the exact hosted hop
		// Auth would construct, and retain the original policy acceptance fields.
		if (hosted && location === withCallback(hosted).href) return withAcceptance(hosted)
		const target = URL.parse(location)
		if (target?.origin === GOOGLE_ORIGIN && !target.username && !target.password) return target.href
	}
	throw new AuthCallError(502, 'oidc_begin_failed')
}
