import { expect, type Page, test } from '@playwright/test'
import { POLICY_ACCEPTANCE } from '../src/lib/identity/policy-consent'

const api = '**/api/identity/sign-in'
const fixtureUrl = process.env.SOLID_AUTH_FIXTURE_URL

// Sign-in methods are rendered from server-side discovery, not a browser GET.
test.describe.configure({ mode: 'default' }) // The Auth fixture state is shared.
test.beforeEach(async () => {
	test.skip(!fixtureUrl, 'requires the local Auth fixture and Solid production build')
	await methods('enabled')
})

async function methods(mode: string) {
	const response = await fetch(new URL('/__fixture', fixtureUrl), {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ mode }),
	})
	expect(response.ok).toBe(true)
}
const email = 'player@example.test'
function redirectPath(location: string, from: string) {
	const target = new URL(location, from)
	expect(target.origin).toBe(new URL(from).origin)
	return target.pathname + target.search
}
const destination = '/support?from=sign-in'

async function open(page: Page) {
	await page.goto(`/sign-in?next=${encodeURIComponent(destination)}`)
	await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email)
	await page.getByRole('button', { name: 'Continue', exact: true }).click()
}

for (const [name, viewport] of [
	['desktop', { width: 1440, height: 900 }],
	['phone', { width: 390, height: 844 }],
] as const) {
	test(`first screen is passwordless at ${name} width`, async ({ page }) => {
		await page.setViewportSize(viewport)
		const response = await page.goto('/sign-in')
		expect(response?.status()).toBe(200)
		expect(response?.headers()['cache-control']).toContain('private')
		expect(response?.headers()['cache-control']).toContain('no-store')
		await expect(page.getByRole('heading', { name: 'Sign in to Tryit' })).toBeVisible()
		await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
		const input = page.getByRole('textbox', { name: 'Email', exact: true })
		await expect(input).toHaveAttribute('type', 'email')
		await expect(input).toHaveAttribute('autocomplete', 'username webauthn')
		await expect(page.locator('input:not([type="hidden"])')).toHaveCount(1)
		await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible()
		await expect(page.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute(
			'href',
			'/terms',
		)
		await expect(page.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
			'href',
			'/privacy',
		)
		await expect(page.getByText(/sign-in is unavailable|create an account|sign up/i)).toHaveCount(0)
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width)
	})
}

test('legacy aliases preserve safe same-origin destinations and are not cacheable', async ({
	request,
}) => {
	for (const alias of ['/login', '/signup', '/sign-up', '/register', '/forgot-password']) {
		const response = await request.get(`${alias}?next=${encodeURIComponent(destination)}`, {
			maxRedirects: 0,
		})
		expect(response.status(), alias).toBe(308)
		expect(redirectPath(response.headers().location, response.url())).toBe(
			`/sign-in?callbackUrl=${encodeURIComponent(destination)}` +
				(alias === '/forgot-password' ? '&recovery=1' : ''),
		)
		expect(response.headers()['cache-control']).toContain('no-store')
	}
	for (const next of [
		'//external.example/path',
		'https://external.example/',
		'/\r\nout',
		'/\\blocked',
	]) {
		const response = await request.get(`/login?next=${encodeURIComponent(next)}`, {
			maxRedirects: 0,
		})
		expect(redirectPath(response.headers().location, response.url())).toBe('/sign-in')
	}
	const old = await request.get('/en-GB/login?callbackUrl=%2Fen-GB%2Fsettings', { maxRedirects: 0 })
	expect(old.status()).toBe(308)
	expect(redirectPath(old.headers().location, old.url())).toBe(
		'/en-GB/sign-in?callbackUrl=%2Fen-GB%2Fsettings',
	)
})

test('sitemap advertises the archive, not auth or private routes', async ({ request }) => {
	const response = await request.get('/sitemap.xml')
	expect(response.status()).toBe(200)
	expect(response.headers()['cache-control']).toBe('public, max-age=3600')
	expect(response.headers()['content-type']).toBe('application/xml; charset=utf-8')
	const xml = await response.text()
	expect(xml).toMatch(/<loc>https?:\/\/[^<]+\/archive<\/loc>/)
	expect(xml).not.toMatch(
		/<loc>[^<]+\/(?:sign-in|login|signup|register|admin|settings|profile|stats)(?:[</])/,
	)
})

test('OTP is inline; keeps input on refusal, resends after cooldown and permits changing email', async ({
	page,
}) => {
	const requests: Array<Record<string, unknown>> = []
	await page.addInitScript(() => {
		PublicKeyCredential.isConditionalMediationAvailable = async () => false
	})
	await page.clock.install()
	await page.route(api, async (route) => {
		const body = route.request().postDataJSON()
		requests.push(body)
		if (body.step === 'email-start')
			return route.fulfill({ json: { expiresIn: 600, flow: `flow-${requests.length}` } })
		return body.code === '632890'
			? route.fulfill({ json: { signedIn: true } })
			: route.fulfill({ status: 401, json: { error: 'proof_rejected' } })
	})
	await open(page)
	const otp = page.getByRole('textbox', { name: '6-digit code' })
	await expect(otp).toBeFocused()
	await expect(otp).toHaveAttribute('autocomplete', 'one-time-code')
	await expect(otp).toHaveAccessibleDescription('Code sent to p•••@example.test')
	await expect(page.getByRole('button', { name: /^Resend in/ })).toBeDisabled()
	await otp.fill('113355')
	await expect(page.getByText('That code didn’t work.', { exact: false })).toBeVisible()
	await expect(otp).toHaveValue('113355')
	await page.clock.fastForward(31_000)
	await page.getByRole('button', { name: 'Resend code' }).click()
	await expect(otp).toHaveValue('')
	expect(requests.filter(({ step }) => step === 'email-start')).toEqual([
		{ step: 'email-start', email },
		{ step: 'email-start', email },
	])
	await page.clock.fastForward(31_000)
	await page.getByRole('button', { name: 'Change email' }).click()
	await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toBeFocused()
	await page.getByRole('textbox', { name: 'Email', exact: true }).fill('other@example.test')
	await page.getByRole('button', { name: 'Continue', exact: true }).click()
	await expect(otp).toHaveAccessibleDescription('Code sent to o•••@example.test')
	await otp.fill('632890')
	await expect(page).toHaveURL(/\/support\?from=sign-in$/)
	expect(requests.at(-1)).toEqual({
		step: 'email-verify',
		flow: 'flow-4',
		code: '632890',
		acceptance: POLICY_ACCEPTANCE,
	})
})

test('Google forwards the safe next destination and policy notice versions', async ({ page }) => {
	await page.route('**/api/identity/oidc/begin', (route) => {
		expect(route.request().postDataJSON()).toMatchObject({
			provider: 'google',
			redirectUrl: destination,
			acceptance: { terms_accepted: true },
		})
		return route.fulfill({ json: { authorizationUrl: destination } })
	})
	await page.goto(`/sign-in?next=${encodeURIComponent(destination)}`)
	await page.getByRole('button', { name: 'Continue with Google' }).click()
	await expect(page).toHaveURL(/\/support\?from=sign-in$/)
})

test('legacy-password-only config shows the existing password on step two, not registration', async ({
	page,
}) => {
	await methods('legacy')
	await page.route('**/api/identity/login', (route) => {
		expect(route.request().postDataJSON()).toEqual({ email, password: 'fixture-password' })
		return route.fulfill({ json: {} })
	})
	await open(page)
	const password = page.locator('[autocomplete="current-password"]')
	await expect(password).toHaveAttribute('autocomplete', 'current-password')
	await expect(page.getByRole('button', { name: 'Email me a code' })).toHaveCount(0)
	await password.fill('fixture-password')
	await page.getByRole('button', { name: 'Continue', exact: true }).click()
	await expect(page).toHaveURL(/\/support\?from=sign-in$/)
})

test('passkey verifies a real Chromium WebAuthn assertion against the fixture', async ({
	page,
	context,
}) => {
	const cdp = await context.newCDPSession(page)
	await cdp.send('WebAuthn.enable')
	await cdp.send('WebAuthn.addVirtualAuthenticator', {
		options: {
			protocol: 'ctap2',
			transport: 'internal',
			hasResidentKey: true,
			hasUserVerification: true,
			isUserVerified: true,
			automaticPresenceSimulation: true,
		},
	})
	const challenge = 'AwQFBgcICQoLDA0ODxAREg'
	let credentialId = ''
	await page.route(api, (route) => {
		const body = route.request().postDataJSON()
		switch (body.step) {
			case 'email-start':
				return route.fulfill({ json: { expiresIn: 600, flow: 'fixture-flow' } })
			case 'passkey-start':
				return route.fulfill({
					json: {
						challengeId: 'fixture-challenge',
						challenge,
						rpId: new URL(page.url()).hostname,
						credentialIds: [credentialId],
						expiresAt: Math.floor(Date.now() / 1000) + 120,
					},
				})
			case 'passkey-verify':
				expect(body).toMatchObject({
					challenge_id: 'fixture-challenge',
					credential_id: credentialId,
					acceptance: POLICY_ACCEPTANCE,
					client_data_json: expect.any(String),
					signature: expect.any(String),
					authenticator_data: expect.any(String),
				})
				return route.fulfill({ json: { signedIn: true } })
			default:
				throw new Error(`unexpected action ${body.step}`)
		}
	})
	await page.addInitScript(() => {
		PublicKeyCredential.isConditionalMediationAvailable = async () => false
	})
	await page.goto(`/sign-in?next=${encodeURIComponent(destination)}`)
	credentialId = await page.evaluate(async () => {
		const credential = await navigator.credentials.create({
			publicKey: {
				rp: { name: 'Tryit test' },
				user: { id: new Uint8Array([19]), name: 'player@example.test', displayName: 'Player' },
				challenge: new Uint8Array([2, 4, 6, 8]),
				pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
				authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
			},
		})
		return credential?.id ?? ''
	})
	expect(credentialId).not.toBe('')
	await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email)
	await page.getByRole('button', { name: 'Continue', exact: true }).click()
	await page.getByRole('button', { name: 'Use a passkey' }).click()
	await expect(page).toHaveURL(/\/support\?from=sign-in$/)
})
