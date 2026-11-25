import { test as base, type Page, type Route } from '@playwright/test'

export const id = 'G-TEST1234'

function whileTargetOpen(page: Page, handle: (route: Route) => Promise<void>) {
	return async (route: Route) => {
		try {
			await handle(route)
		} catch (error) {
			// The request context can be disposed before Playwright marks the page closed.
			// Playwright does not export TargetClosedError in its public errors API.
			if (
				error instanceof Error &&
				(error.constructor.name === 'TargetClosedError' ||
					(page.isClosed() && error.message === 'Response has been disposed'))
			) {
				// Settle Playwright's route bookkeeping even though the target is gone.
				await route.fallback()
				return
			}
			throw error
		}
	}
}

/** Inspect the real runtime while preventing any external Google request. */
export async function capture(page: Page) {
	const requests: string[] = []
	await page.route(
		/https:\/\/[^/]*(googletagmanager\.com|google-analytics\.com|analytics\.google\.com|googleadservices\.com|googlesyndication\.com|doubleclick\.net)\//,
		whileTargetOpen(page, async (route) => {
			requests.push(route.request().url())
			await route.fulfill({
				contentType: 'application/javascript',
				body: '/* test stub, no external traffic */',
			})
		}),
	)
	await page.route(
		'**/api/consent-context',
		whileTargetOpen(page, async (route) => {
			const response = await route.fetch()
			await route.fulfill({
				response,
				json: { ...(await response.json()), ids: { ga: id, ads: 'AW-123456789' } },
			})
		}),
	)
	return requests
}

/** Optional fixture: other tests in the same file keep their normal route lifecycle. */
export const googleTagTest = base.extend<{ googleRequests: string[] }>({
	googleRequests: async ({ page }, use) => {
		try {
			await use(await capture(page))
		} finally {
			await page.unrouteAll({ behavior: 'ignoreErrors' })
		}
	},
})

export function readTagCommands() {
	return ((window as Window & { dataLayer?: Array<ArrayLike<unknown>> }).dataLayer ?? []).map(
		(entry) => Array.from(entry),
	)
}

export function commands(page: Page) {
	return page.evaluate(readTagCommands)
}
