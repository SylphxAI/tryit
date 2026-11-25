import { expect, type Page, test } from '@playwright/test'
import { fixtureToken } from '../scripts/auth-fixture-facts'
import { SIGNUP_COOKIE } from '../src/lib/identity/after-sign-up'
import { OAUTH_ACCEPTANCE, OAUTH_PREFIX } from '../src/lib/identity/oauth-contract'
import { POLICY_ACCEPTANCE } from '../src/lib/identity/policy-consent'
import { CONSENT_KEY } from '../src/lib/storage-keys'
import { capture, commands, id } from './google-tag-support'

const authFixture = process.env.SOLID_AUTH_FIXTURE_URL
const browserCookies = [
	{ name: '__Host-puzzled_guest', value: 'fixture-guest' },
	{ name: 'puzzled_checkout_claim', value: 'fixture-claim' },
]
const startPath = '/v1/client/continue'
const verifyPath = `${startPath}/verify`
const redeemPath = '/v1/client/tickets:redeem'
const ledgerPath = '/v1/consents'
const passkeyVerifyPath = '/v1/client/sign-in/passkey/verify'
const edgeHeaders = {
	'sylphx-edge': 'public',
	'x-forwarded-host': 'tryit.fun',
	'x-forwarded-proto': 'https',
}
const edgeOrigin = 'https://tryit.fun'

// Model the trusted TLS edge while keeping real handlers and the Auth fixture in the path.
async function routeThroughEdge(page: Page, endpoint: string) {
	await page.route(`**/api/identity/${endpoint}`, async (route) => {
		const response = await route.fetch({
			maxRedirects: 0,
			headers: { ...route.request().headers(), ...edgeHeaders, origin: edgeOrigin },
		})
		await route.fulfill({ response })
	})
}

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

function expectConsentWriteAfterProof(
	calls: Awaited<ReturnType<typeof fixture>>,
	proofPath: string,
) {
	const ledger = calls.filter(({ path }) => path === ledgerPath)
	expect(ledger).toEqual([
		{
			path: ledgerPath,
			body: {
				idempotency_key: expect.stringMatching(
					/^[\da-f]{8}-[\da-f]{4}-7[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/,
				),
				project_id: 'organization-00000000-0000-4000-8000-000000000123',
				principal_id: 'fixture-user',
				purpose: 'necessary',
				state: 'granted',
				legal_basis: 'consent',
				occurred_at_unix_seconds: expect.any(Number),
			},
		},
	])
	const paths = calls.map(({ path }) => path)
	expect(paths.filter((path) => path.startsWith('/v1/auth/'))).toEqual([])
	const proofIndex = paths.lastIndexOf(proofPath)
	expect(proofIndex).toBeGreaterThanOrEqual(0)
	const redeemIndex = paths.indexOf(redeemPath)
	expect(redeemIndex).toBeGreaterThan(proofIndex)
	const resolvedIndex = paths.indexOf('/v1/sessions/current', redeemIndex + 1)
	expect(resolvedIndex).toBeGreaterThan(redeemIndex)
	expect(paths.indexOf(ledgerPath)).toBeGreaterThan(resolvedIndex)
}

const practicePath = '/games/word-guess?mode=practice'
const entryPages = [
	'/',
	'/games',
	'/support',
	'/vs',
	'/vs/elevate',
	'/r/unknown?game=sudoku',
	practicePath,
]

async function expectEntryHeader(page: Page, path: string, signedIn: boolean) {
	const response = await page.goto(path)
	expect(response?.status()).toBe(200)
	expect(response?.headers()['cache-control']).toBe('private, no-store')
	// Read the original HTML, not a header that hydration might have repaired.
	const headerHtml = (await response?.text())?.match(
		/<header class="site-header[^>]*>[\s\S]*?<\/header>/,
	)?.[0]
	expect(headerHtml).toBeDefined()
	if (signedIn) {
		expect(headerHtml).toContain('aria-label="Account"')
		expect(headerHtml).not.toContain('>Sign in<')
	} else {
		expect(headerHtml).toContain('>Sign in<')
		expect(headerHtml).not.toContain('aria-label="Account"')
	}
	const header = page.locator('.site-header')
	await expect(
		header.getByRole('link', { name: signedIn ? 'Account' : 'Sign in', exact: true }),
	).toBeVisible()
	await expect(
		header.getByRole('link', { name: signedIn ? 'Sign in' : 'Account', exact: true }),
	).toHaveCount(0)
}

test('a fresh guest gets server-rendered Sign in and reaches the practice offer', async ({
	page,
}) => {
	await fixture('enabled')
	await page.route('**/puzzled.v1.PuzzleService/GetPracticePuzzle', (route) =>
		route.fulfill({ status: 401, json: { code: 'unauthenticated', message: 'sign_in_required' } }),
	)
	for (const path of entryPages) await expectEntryHeader(page, path, false)
	await expect(
		page.locator('[data-unlock-panel="practice"] a[href="/pricing?trigger=practice_upsell"]'),
	).toBeVisible()
	expect((await fixture()).filter(({ path }) => path === '/v1/sessions/current')).toEqual([])
})

test('a verified session gets server-rendered Account and sends credentials on a practice deep link', async ({
	page,
	context,
	baseURL,
}) => {
	await fixture('slow-session')
	await context.addCookies([
		{ name: 'puzzled_session', value: fixtureToken, url: baseURL!, httpOnly: true },
	])
	await page.route('**/puzzled.v1.PuzzleService/GetPracticePuzzle', async (route) => {
		const cookie = (await route.request().allHeaders()).cookie
		expect(cookie?.split('; ')).toContain(`puzzled_session=${fixtureToken}`)
		await route.fulfill({
			json: {
				gameSlug: 'word-guess',
				practiceSeed: '1',
				puzzleDataJson: JSON.stringify({ wordLength: 5, maxAttempts: 6 }),
			},
		})
	})
	for (const path of entryPages) await expectEntryHeader(page, path, true)
	await expect(page.locator('[data-practice-seed="1"]')).toBeVisible()
	await page.setViewportSize({ width: 390, height: 844 })
	await expect(page.locator('.site-header').getByRole('link', { name: 'Account' })).toBeVisible()
})

test('desktop sign-in explains the benefits without competing with account entry', async ({
	page,
}) => {
	await fixture('enabled')
	await page.setViewportSize({ width: 1440, height: 900 })
	await page.goto('/sign-in')
	await expect(page.getByRole('heading', { name: 'Sign in to Tryit' })).toBeVisible()
	const panel = page.getByRole('complementary')
	await expect(panel.getByRole('heading', { name: 'Keep your progress with you' })).toBeVisible()
	await expect(panel.getByRole('listitem')).toHaveText([
		'Sync your streaks across devices',
		'Save your puzzle stats',
		'Unlock the 30-day archive with Tryit Plus',
	])
	await expect(page.getByText(/No account needed to/)).toHaveCount(0)
	await expect(page.locator('#email')).toBeVisible()
})

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

test('Google binds first-click policy and returns to the app with a secure session', async ({
	page,
	context,
	request,
}) => {
	await fixture('google')
	const start = `${OAUTH_PREFIX}/start/google`
	await routeThroughEdge(page, 'oauth/start/google')
	await routeThroughEdge(page, 'oauth/callback?**')
	const provider = 'https://accounts.google.com/o/oauth2/v2/auth'
	await page.route(`${provider}?**`, (route) => route.fulfill({ status: 204 }))
	await page.goto('/sign-in?callbackUrl=%2Farchive')
	const google = page.getByRole('button', { name: 'Continue with Google' })
	await expect(google).toBeEnabled()
	await expect(google).toHaveAccessibleDescription(
		'By continuing, you agree to our Terms of Service and Privacy Policy.',
	)
	const headers = { ...edgeHeaders, origin: edgeOrigin }
	const refused = await request.post(start, { headers, data: { next: '/archive' } })
	expect(refused.status()).toBe(403)
	expect(refused.headers()['set-cookie']).toBeUndefined()
	const [response, googleRequest] = await Promise.all([
		page.waitForResponse(`**${start}`),
		page.waitForRequest(`${provider}?**`),
		google.click(),
	])
	expect(response.ok()).toBe(true)
	expect(response.request().postDataJSON()).toEqual({
		next: '/archive',
		acceptance: OAUTH_ACCEPTANCE,
	})
	const callback = new URL(googleRequest.url()).searchParams.get('state')
	expect(callback).toContain(`${OAUTH_PREFIX}/callback?flow=`)
	await page.goto(callback!)
	await expect(page).toHaveURL('/archive')
	expect((await context.cookies()).find(({ name }) => name === 'puzzled_session')).toMatchObject({
		httpOnly: true,
		secure: true,
		sameSite: 'Lax',
	})
	expect((await context.cookies()).some(({ name }) => name === '__Host-auth_flow')).toBe(false)
	expect((await fixture()).filter(({ path }) => path === redeemPath)).toHaveLength(1)
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
	await routeThroughEdge(page, 'sign-in')
	await page.setViewportSize({ width: 390, height: 844 })
	await page.goto('/sign-in?callbackUrl=%2Farchive%3Ffrom%3Dgame')
	await expect(page.locator('#email')).toHaveAttribute('autocomplete', 'username webauthn')
	const continueButton = page.getByRole('button', { name: 'Continue', exact: true })
	await expect(continueButton).toBeEnabled()
	await expect(continueButton).toHaveAccessibleDescription(
		'By continuing, you agree to our Terms of Service and Privacy Policy.',
	)
	await expect(
		page.locator('#sign-in-policy-notice').getByRole('link', { name: 'Terms of Service' }),
	).toHaveAttribute('href', '/terms')
	await expect(
		page.locator('#sign-in-policy-notice').getByRole('link', { name: 'Privacy Policy' }),
	).toHaveAttribute('href', '/privacy')
	await continueButton.click()
	await expect(page.locator('#email')).toHaveAttribute('aria-invalid', 'true')
	expect((await fixture()).filter(({ path }) => path === startPath)).toHaveLength(0)
	for (const path of ['terms', 'privacy']) {
		const policy = await page.request.get(`/${path}`)
		expect(policy.status()).toBe(200)
		expect(await policy.text()).toContain('2026-11-14')
	}
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
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
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
	const calls = await fixture()
	expect(calls.filter(({ path }) => path === startPath)).toHaveLength(1)
	expect(calls.filter(({ path }) => path === verifyPath)).toHaveLength(2)
	expect(calls.filter(({ path }) => path === redeemPath)).toHaveLength(1)
	expectConsentWriteAfterProof(calls, verifyPath)
})

const emailProof = { step: 'email-verify', flow: 'A'.repeat(43), code: '141421' }
const passkeyProof = {
	step: 'passkey-verify',
	challenge_id: 'fixture-ceremony',
	credential_id: 'abc',
	client_data_json: 'abc',
	authenticator_data: 'abc',
	signature: 'abc',
	user_handle: '',
}
const signInURL = '/api/identity/sign-in'
const signInHeaders = { ...edgeHeaders, origin: edgeOrigin }

test('real sign-in endpoint requires browser Origin, valid proof and current acceptance', async ({
	request,
}) => {
	await fixture('enabled')
	const verify = { ...emailProof, acceptance: POLICY_ACCEPTANCE }
	for (const origin of [undefined, 'https://foreign.example', 'null']) {
		const response = await request.post(signInURL, {
			headers: origin === undefined ? edgeHeaders : { ...edgeHeaders, origin },
			data: verify,
		})
		expect(response.status()).toBe(403)
		expect(response.headers()['set-cookie']).toBeUndefined()
	}
	const malformed = await request.post(signInURL, {
		headers: signInHeaders,
		data: { ...verify, code: '12345' },
	})
	expect(malformed.status()).toBe(400)
	for (const proof of [emailProof, passkeyProof]) {
		for (const acceptance of [undefined, { ...POLICY_ACCEPTANCE, terms_version: '2020-01-01' }]) {
			const response = await request.post(signInURL, {
				headers: signInHeaders,
				data: { ...proof, acceptance },
			})
			expect(response.status()).toBe(400)
			expect(await response.json()).toEqual({ error: 'policy_acceptance_required' })
			expect(response.headers()['set-cookie']).toBeUndefined()
		}
	}
	expect(await fixture()).toEqual([])
})

for (const [proof, path] of [
	[emailProof, verifyPath],
	[passkeyProof, passkeyVerifyPath],
] as const) {
	test(`${proof.step} fails closed when the consent ledger refuses the write`, async ({
		request,
	}) => {
		await fixture('refuse-consent')
		const refused = await request.post(signInURL, {
			headers: signInHeaders,
			data: { ...proof, acceptance: POLICY_ACCEPTANCE },
		})
		expect(refused.status()).toBe(502)
		expect(await refused.json()).toEqual({ error: 'sign_in_unavailable' })
		expect(refused.headers()['set-cookie']).toBeUndefined()
		expect(refused.headers()['cache-control']).toBe('no-store')
		expectConsentWriteAfterProof(await fixture(), path)
	})
}

test('real passkey sign-in records acceptance and sets the session cookie', async ({ request }) => {
	await fixture('enabled')
	const begun = await request.post(signInURL, {
		headers: signInHeaders,
		data: { step: 'passkey-start', origin: 'https://ignored.example', rp_id: 'ignored.example' },
	})
	expect(begun.ok()).toBeTruthy()
	expect(await begun.json()).toMatchObject({
		rpId: new URL(edgeOrigin).hostname,
		credentialIds: [],
	})
	const response = await request.post(signInURL, {
		headers: signInHeaders,
		data: { ...passkeyProof, acceptance: POLICY_ACCEPTANCE },
	})
	expect(response.ok()).toBeTruthy()
	expect(await response.json()).toEqual({ signedIn: true, newAccount: false })
	expect(response.headers()['set-cookie']).toMatch(/^puzzled_session=.+;.*HttpOnly/)
	const calls = await fixture()
	expect(calls.find(({ path }) => path.endsWith('/passkey/begin'))?.body).toEqual({
		rp_id: new URL(edgeOrigin).hostname,
		origin: signInHeaders.origin,
	})
	expectConsentWriteAfterProof(calls, passkeyVerifyPath)
})

for (const [isNew, consent, expected] of [
	[true, 'accepted', 1],
	[true, 'pending', 1],
	[true, 'declined', 0],
	[false, 'accepted', 0],
] as const) {
	test(`GA4 signup: ${isNew ? 'new' : 'returning'} account with ${consent} analytics`, async ({
		page,
		context,
	}) => {
		await fixture(isNew ? 'new' : 'enabled')
		await capture(page)
		await routeThroughEdge(page, 'sign-in')
		await page.setExtraHTTPHeaders({ 'CF-IPCountry': 'US' })
		await page.addInitScript(
			({ consent, key }) => {
				if (consent !== 'pending')
					localStorage.setItem(key, consent === 'accepted' ? 'analytics_only' : 'denied')
				window.addEventListener('consent-change', () => {
					document.documentElement.dataset.fixtureConsentReady = 'true'
				})
			},
			{ consent, key: CONSENT_KEY },
		)
		await page.goto('/sign-in?callbackUrl=%2Farchive')
		await page.locator('#email').fill('synthetic@example.test')
		await page.getByRole('button', { name: 'Continue', exact: true }).click()
		const code = page.getByLabel('6-digit code')
		await expect(code).toBeVisible()
		await Promise.all([page.waitForResponse('**/api/consent-context'), code.fill('141421')])
		await expect(page).toHaveURL(/\/archive(?:\?|$)/)
		const events = async () => (await commands(page)).filter((row) => row[1] === 'sign_up')
		await expect(page.locator('html')).toHaveAttribute('data-fixture-consent-ready', 'true')
		expect(await events()).toEqual(
			expected ? [['event', 'sign_up', { method: 'email', send_to: id }]] : [],
		)
		expect((await commands(page)).filter((row) => row[1] === 'page_view')).toEqual([])
		expect((await context.cookies()).some(({ name }) => name === SIGNUP_COOKIE)).toBe(false)
		await page.goto('/archive?signedUp=1')
		await expect(page.locator('html')).toHaveAttribute('data-fixture-consent-ready', 'true')
		expect(await events()).toEqual([])
	})
}
