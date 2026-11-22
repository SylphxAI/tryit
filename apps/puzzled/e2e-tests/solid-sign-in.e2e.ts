import { expect, test } from '@playwright/test'
import { POLICY_ACCEPTANCE } from '../src/lib/identity/policy-consent'

const authFixture = process.env.SOLID_AUTH_FIXTURE_URL
const browserCookies = [
	{ name: '__Host-puzzled_guest', value: 'fixture-guest' },
	{ name: 'puzzled_checkout_claim', value: 'fixture-claim' },
]
const startPath = '/v1/client/continue'
const verifyPath = `${startPath}/verify`
const redeemPath = '/v1/client/tickets:redeem'

test.describe.configure({ mode: 'serial' })
test.beforeEach(() =>
	test.skip(!authFixture, 'requires the local Auth fixture and Solid production build'),
)

async function fixture(
	mode?: string,
): Promise<{ path: string; body: Record<string, unknown> | null }[]> {
	const response = await fetch(
		new URL('/__fixture', authFixture),
		mode
			? {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ mode }),
				}
			: undefined,
	)
	return (await response.json()).calls
}

test('legacy 308 aliases preserve only safe localized returns and pending links are not consumed by opening', async ({
	page,
	request,
}) => {
	await fixture('legacy')
	for (const alias of ['login', 'signup', 'sign-up', 'register', 'forgot-password']) {
		const response = await request.get(
			`/zh-HK/${alias}?next=%2Fzh-HK%2Farchive%3Ffrom%3Dgame%23day`,
			{ maxRedirects: 0 },
		)
		expect(response.status()).toBe(308)
		const target = new URL(response.headers().location, 'https://tryit.fun')
		expect(target.pathname).toBe('/zh-HK/sign-in')
		expect(target.searchParams.get('callbackUrl')).toBe('/zh-HK/archive?from=game#day')
		expect(target.searchParams.has('recovery')).toBe(alias === 'forgot-password')
	}
	const response = await request.get(
		'/en-US/register?callbackUrl=%2F%2Fexternal.example&ignored=1',
		{ maxRedirects: 0 },
	)
	expect(response.headers().location).toBe('/sign-in')
	await page.goto('/verify-email?challenge_id=issued&token=fixture-proof')
	await expect(page.getByRole('button', { name: 'Confirm my email' })).toBeVisible()
	expect((await fixture()).filter(({ path }) => path.includes('verification'))).toEqual([])
	await page.getByRole('button', { name: 'Confirm my email' }).click()
	await expect(page.getByRole('heading', { name: 'Email verified', exact: false })).toBeVisible()
	await page.goto('/reset-password?challenge_id=issued&token=fixture-proof')
	await expect(page.locator('[autocomplete="new-password"]')).toHaveCount(2)
	await page.goto('/forgot-password?next=%2Farchive')
	await expect(page.getByRole('button', { name: /send reset link/i })).toBeVisible()
	await expect(page).toHaveURL('/sign-in?callbackUrl=%2Farchive&recovery=1')
})

test('legacy password works only on step two; disabled capabilities render no fake methods', async ({
	page,
	request,
}) => {
	await fixture('off')
	await page.goto('/sign-in')
	await expect(page.getByText('Sign-in is unavailable right now. Try again later.')).toBeVisible()
	await expect(page.getByRole('button', { name: /continue|passkey/i })).toHaveCount(0)
	await fixture('legacy')
	await page.goto('/login?callbackUrl=%2Farchive')
	await expect(page.getByRole('heading', { name: 'Sign in to Tryit' })).toBeVisible()
	await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
	await expect(page.locator('[autocomplete="current-password"]')).toHaveCount(0)
	await page.locator('#email').fill('synthetic@example.test')
	await page.getByRole('button', { name: 'Continue', exact: true }).click()
	await page.locator('[autocomplete="current-password"]').fill('old')
	await page.getByRole('button', { name: 'Continue', exact: true }).click()
	await expect(page).toHaveURL('/archive')
	const removedSignup = await request.post('/api/identity/signup', { data: {} })
	expect(removedSignup.status()).toBe(404)
})

test('mobile OTP stays inline, masks recipient, preserves rejected input, and resumes as a signed-in guest', async ({
	page,
	context,
	baseURL,
}, testInfo) => {
	await fixture('enabled')
	await context.addCookies(
		browserCookies.map(({ name, value }) => ({
			name,
			value,
			domain: new URL(baseURL!).hostname,
			path: '/',
			secure: true,
		})),
	)
	await page.setViewportSize({ width: 360, height: 760 })
	await page.goto('/sign-in?callbackUrl=%2Farchive%3Ffrom%3Dgame')
	await expect(page.locator('#email')).toHaveAttribute('autocomplete', 'username webauthn')
	await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled()
	for (const path of ['terms', 'privacy']) {
		const policy = await page.request.get(`/${path}`)
		expect(policy.status()).toBe(200)
		expect(await policy.text()).toContain('2026-11-14')
	}
	await page.locator('#sign-in-policy').check()
	await page.locator('#email').fill('synthetic@example.test')
	await page.getByRole('button', { name: 'Continue', exact: true }).click()
	const code = page.getByLabel('6-digit code')
	await expect(code).toBeFocused()
	await expect(code).toHaveAttribute('autocomplete', 'one-time-code')
	await expect(
		page.getByText('Code sent to s•••@example.test', { exact: true }).first(),
	).toBeVisible()
	await expect(page.getByRole('button', { name: /^Resend in/ })).toBeDisabled()
	await expect(page.getByRole('button', { name: 'Use password instead' })).toBeVisible()
	await expect(page.locator('[autocomplete="new-password"]')).toHaveCount(0)
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360)
	await page.screenshot({ path: testInfo.outputPath('mobile-code.png') })
	await code.fill('14142')
	expect((await fixture()).filter(({ path }) => path === verifyPath)).toHaveLength(0)
	await code.fill('000000')
	await expect(page.getByText(/That code didn’t work/)).toBeVisible()
	await expect(code).toHaveValue('000000')
	await expect(page).toHaveURL('/sign-in?callbackUrl=%2Farchive%3Ffrom%3Dgame')
	await code.fill('141 421')
	await expect(page).toHaveURL('/archive?from=game')
	const cookies = await context.cookies()
	expect(cookies.find(({ name }) => name === 'puzzled_session')).toMatchObject({
		httpOnly: true,
		sameSite: 'Lax',
	})
	for (const cookie of browserCookies)
		expect(cookies.find(({ name }) => name === cookie.name)).toMatchObject(cookie)
	expect(await page.evaluate(() => document.cookie)).not.toContain('fixture-session')
	const calls = (await fixture()).map(({ path }) => path)
	expect(calls.filter((path) => path === startPath)).toHaveLength(1)
	expect(calls.filter((path) => path === verifyPath)).toHaveLength(2)
	expect(calls.filter((path) => path === redeemPath)).toHaveLength(1)
	expect(calls).toContain('/v1/auth/consent:accept')
})

test('real sign-in endpoint requires browser Origin, valid proof and current consent before it sets cookies', async ({
	request,
	baseURL,
}) => {
	await fixture('refuse-consent')
	const verify = {
		step: 'email-verify',
		flow: 'A'.repeat(43),
		code: '141421',
		acceptance: POLICY_ACCEPTANCE,
	}
	for (const origin of [undefined, 'https://foreign.example', 'null']) {
		const response = await request.post('/api/identity/sign-in', {
			headers: origin === undefined ? undefined : { origin },
			data: verify,
		})
		expect(response.status()).toBe(403)
		expect(response.headers()['set-cookie']).toBeUndefined()
	}
	const headers = { origin: new URL(baseURL!).origin }
	const malformed = await request.post('/api/identity/sign-in', {
		headers,
		data: { ...verify, code: '12345' },
	})
	expect(malformed.status()).toBe(400)
	const missingConsent = await request.post('/api/identity/sign-in', {
		headers,
		data: { ...verify, acceptance: undefined },
	})
	expect(missingConsent.status()).toBe(400)
	expect(await fixture()).toEqual([])
	const refused = await request.post('/api/identity/sign-in', { headers, data: verify })
	expect(refused.status()).toBe(502)
	expect(refused.headers()['set-cookie']).toBeUndefined()
	expect(refused.headers()['cache-control']).toBe('no-store')
	await fixture('enabled')
	const begun = await request.post('/api/identity/sign-in', {
		headers,
		data: { step: 'passkey-start', origin: 'https://ignored.example', rp_id: 'ignored.example' },
	})
	expect(begun.ok()).toBeTruthy()
	expect(await begun.json()).toMatchObject({ rpId: new URL(baseURL!).hostname, credentialIds: [] })
	const response = await request.post('/api/identity/sign-in', {
		headers,
		data: {
			step: 'passkey-verify',
			acceptance: POLICY_ACCEPTANCE,
			challenge_id: 'fixture-ceremony',
			credential_id: 'abc',
			client_data_json: 'abc',
			authenticator_data: 'abc',
			signature: 'abc',
			user_handle: '',
		},
	})
	expect(response.ok()).toBeTruthy()
	expect(await response.json()).toEqual({ signedIn: true, newAccount: false })
	expect(response.headers()['set-cookie']).toContain('HttpOnly')
	expect((await fixture()).find(({ path }) => path.endsWith('/passkey/begin'))?.body).toEqual({
		rp_id: new URL(baseURL!).hostname,
		origin: headers.origin,
	})
})
