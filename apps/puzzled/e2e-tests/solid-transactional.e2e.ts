import { expect, test } from '@playwright/test'

test.describe('Solid transactional landings', () => {
	test.skip(process.env.SOLID_FIXTURE !== '1', 'run against the Solid production build')

	test('a localized family invite preserves the first code through sign-in without joining', async ({
		page,
	}) => {
		const response = await page.goto('/zh-HK/family/join?code=one%2B%26two&code=ignored')
		expect(response?.status()).toBe(200)
		expect(response?.headers()['cache-control']).toBe('private, no-store')
		expect(response?.headers()['referrer-policy']).toBe('no-referrer')
		await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', 'noindex, nofollow')
		await expect(page.getByRole('heading', { name: '加入 Tryit Plus 家庭方案' })).toBeVisible()
		const signIn = page.getByRole('link', { name: '登入以加入' })
		const target = new URL((await signIn.getAttribute('href'))!, page.url())
		expect(target.pathname).toBe('/zh-HK/sign-in')
		expect(target.searchParams.get('callbackUrl')).toBe('/zh-HK/family/join?code=one%2B%26two')
		await expect(page.getByRole('button', { name: '加入家庭方案' })).toHaveCount(0)
	})

	test('authenticated family invite handles rejection and redirects only after accepted join', async ({
		page,
		context,
		baseURL,
	}) => {
		test.skip(!process.env.SOLID_AUTH_FIXTURE_URL, 'requires the local Auth fixture')
		await context.addCookies([{ name: 'puzzled_session', value: 'fixture-session', url: baseURL }])
		await page.route('**/v1/guest/session', (route) => route.fulfill({ json: { issued: false } }))
		const codes: string[] = []
		await page.route('**/puzzled.v1.BillingService/JoinFamily', (route) => {
			codes.push(route.request().postDataJSON().inviteCode)
			return codes.length === 1
				? route.fulfill({
						status: 400,
						json: { code: 'failed_precondition', message: 'family_full' },
					})
				: route.fulfill({ json: {} })
		})
		await page.goto('/family/join')
		await expect(page.getByRole('button', { name: 'Join the family plan' })).toBeDisabled()
		await expect(page.getByRole('alert')).toContainText('This invite link is not valid.')
		expect(codes).toEqual([])
		await page.goto('/family/join?code=fixture-invite')
		const join = page.getByRole('button', { name: 'Join the family plan' })
		await join.click()
		await expect(page.getByRole('alert')).toContainText('This family plan is full.')
		await expect(join).toBeEnabled()
		expect(codes).toEqual(['fixture-invite'])
		await join.click()
		await expect(page).toHaveURL(/\/settings\/subscription$/)
		expect(codes).toEqual(['fixture-invite', 'fixture-invite'])
	})

	test('unsubscribe renders redirect statuses without another POST and handles direct token links', async ({
		page,
		request,
	}) => {
		const result = await request.get('/api/email/unsubscribe', { maxRedirects: 0 })
		expect(result.status()).toBe(307)
		expect(new URL(result.headers().location).search).toBe('?error=missing_token')
		const tokens: string[] = []
		await page.route('**/api/email/unsubscribe', (route) => {
			expect(route.request().method()).toBe('POST')
			const token = route.request().postDataJSON().token
			tokens.push(token)
			return route.fulfill({ status: token === 'active' ? 200 : 400, json: {} })
		})
		const response = await page.goto('/unsubscribe?error=missing_token&token=do-not-submit')
		expect(response?.headers()['referrer-policy']).toBe('no-referrer')
		expect(response?.headers()['cache-control']).toBe('private, no-store')
		await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', 'noindex, nofollow')
		await expect(page.getByRole('alert')).toContainText('No unsubscribe token provided.')
		await page.goto('/unsubscribe?success=true&token=do-not-submit')
		await expect(page.getByRole('heading', { name: 'Unsubscribed Successfully' })).toBeVisible()
		await page.goto('/unsubscribe?token=bad')
		await expect(page.getByRole('alert')).toContainText('Invalid or expired unsubscribe link.')
		await page.goto('/unsubscribe?token=active')
		await expect(page.getByRole('heading', { name: 'Unsubscribed Successfully' })).toBeVisible()
		expect(tokens).toEqual(['bad', 'active'])
	})

	test('the retired step-up route still redirects to safe same-site destinations', async ({
		request,
	}) => {
		const path = (target: string) =>
			`/zh-HK/challenge?${new URLSearchParams({ redirect: target, theme: 'admin' })}`
		for (const [target, expected] of [
			['/zh-HK/archive?from=admin#week', '/zh-HK/archive?from=admin#week'],
			['https://elsewhere.example', '/zh-HK'],
			['/challenge', '/zh-HK'],
		]) {
			const result = await request.get(path(target), { maxRedirects: 0 })
			expect(result.status()).toBe(307)
			expect(result.headers().location).toBe(expected)
		}
	})
})
