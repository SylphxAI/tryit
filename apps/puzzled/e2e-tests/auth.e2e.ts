import { expect, type Page, test } from '@playwright/test'

const api = '**/api/identity/sign-in'
const config = { google: true, emailOtp: true, passkey: false, password: true }
const email = 'player@example.test'
const pathOf = (url: string) => {
	const { pathname, search } = new URL(url)
	return pathname + search
}
const destination = '/support?from=sign-in'

async function open(page: Page) {
	await page.goto(`/sign-in?next=${encodeURIComponent(destination)}`)
	await page.getByRole('textbox', { name: 'Email address' }).fill(email)
	await page.getByRole('button', { name: 'Continue', exact: true }).click()
}

for (const [name, viewport] of [
	['desktop', { width: 1440, height: 900 }],
	['phone', { width: 390, height: 844 }],
] as const) {
	test(`first screen is passwordless at ${name} width`, async ({ page }) => {
		await page.setViewportSize(viewport)
		await page.route(api, (route) => route.fulfill({ json: config }))
		const response = await page.goto('/sign-in')
		expect(response?.status()).toBe(200)
		expect(response?.headers()['cache-control']).toContain('private')
		expect(response?.headers()['cache-control']).toContain('no-store')
		await expect(page.getByRole('heading', { name: 'Sign in to Tryit' })).toBeVisible()
		await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
		const input = page.getByRole('textbox', { name: 'Email address' })
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
		expect(pathOf(response.headers().location)).toBe(
			`/sign-in?next=${encodeURIComponent(destination)}`,
		)
		expect(response.headers()['cache-control']).toBe('private, no-store')
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
		expect(pathOf(response.headers().location)).toBe('/sign-in')
	}
	const old = await request.get('/en-GB/login?callbackUrl=%2Fen-GB%2Fsettings', { maxRedirects: 0 })
	expect(old.status()).toBe(308)
	expect(pathOf(old.headers().location)).toBe('/en-GB/sign-in?next=%2Fen-GB%2Fsettings')
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
	await page.clock.install()
	await page.route(api, async (route) => {
		if (route.request().method() === 'GET') return route.fulfill({ json: config })
		const body = route.request().postDataJSON()
		requests.push(body)
		if (body.action === 'continue')
			return route.fulfill({ json: { step: 'email_otp', flow: `flow-${requests.length}` } })
		return body.code === '632890'
			? route.fulfill({ json: { signedIn: true } })
			: route.fulfill({ status: 401, json: { error: 'identity_rejected' } })
	})
	await open(page)
	const otp = page.getByRole('textbox', { name: '6-digit code' })
	await expect(otp).toBeFocused()
	await expect(otp).toHaveAttribute('autocomplete', 'one-time-code')
	await expect(page.getByText('Code sent to p•••@example.test')).toBeVisible()
	await expect(page.getByRole('button', { name: /^Resend in/ })).toBeDisabled()
	await otp.fill('113355')
	await expect(page.getByText("That code didn't work.", { exact: false })).toBeVisible()
	await expect(otp).toHaveValue('113355')
	await page.clock.fastForward(31_000)
	await page.getByRole('button', { name: 'Resend code' }).click()
	await expect(otp).toHaveValue('')
	expect(requests[2]).toEqual({ action: 'continue', email, method: 'email_otp' })
	await page.getByRole('button', { name: 'Change email' }).click()
	await expect(page.getByRole('textbox', { name: 'Email address' })).toBeFocused()
	await page.getByRole('textbox', { name: 'Email address' }).fill('other@example.test')
	await page.getByRole('button', { name: 'Continue', exact: true }).click()
	await expect(page.getByText('Code sent to o•••@example.test')).toBeVisible()
	await otp.fill('632890')
	await expect(page).toHaveURL(/\/support\?from=sign-in$/)
	expect(requests.at(-1)).toEqual({ action: 'verify-code', flow: 'flow-4', code: '632890' })
})

test('Google forwards the safe next destination and policy notice versions', async ({ page }) => {
	await page.route(api, (route) => route.fulfill({ json: config }))
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
	await page.route(api, (route) =>
		route.fulfill({
			json:
				route.request().method() === 'GET' ? { ...config, emailOtp: false } : { step: 'password' },
		}),
	)
	await page.route('**/api/identity/login', (route) => {
		expect(route.request().postDataJSON()).toEqual({ email, password: 'fixture-password' })
		return route.fulfill({ json: {} })
	})
	await open(page)
	const password = page.getByLabel('Use your existing password')
	await expect(password).toHaveAttribute('autocomplete', 'current-password')
	await expect(page.getByRole('button', { name: 'Email me a code' })).toHaveCount(0)
	await password.fill('fixture-password')
	await page.getByRole('button', { name: 'Sign in', exact: true }).click()
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
		if (route.request().method() === 'GET')
			return route.fulfill({ json: { ...config, passkey: true } })
		const body = route.request().postDataJSON()
		switch (body.action) {
			case 'continue':
				return route.fulfill({ json: { step: 'email_otp', flow: 'fixture-flow' } })
			case 'begin-passkey':
				return route.fulfill({
					json: {
						challengeId: 'fixture-challenge',
						challenge,
						rpId: new URL(page.url()).hostname,
						allowCredentials: body.email ? [credentialId] : [],
					},
				})
			case 'verify-passkey':
				expect(body).toMatchObject({
					challengeId: 'fixture-challenge',
					credentialId,
					clientDataJSON: expect.any(String),
					signature: expect.any(String),
					authenticatorData: expect.any(String),
				})
				return route.fulfill({ json: { signedIn: true } })
			default:
				throw new Error(`unexpected action ${body.action}`)
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
	await page.getByRole('textbox', { name: 'Email address' }).fill(email)
	await page.getByRole('button', { name: 'Continue', exact: true }).click()
	await page.getByRole('button', { name: 'Use a passkey' }).click()
	await expect(page).toHaveURL(/\/support\?from=sign-in$/)
})
