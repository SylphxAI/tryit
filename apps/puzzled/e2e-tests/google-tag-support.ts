import type { Page } from '@playwright/test'

export const id = 'G-TEST1234'

/** Inspect the real runtime while preventing any external Google request. */
export async function capture(page: Page) {
	const requests: string[] = []
	await page.route(
		/https:\/\/[^/]*(googletagmanager\.com|google-analytics\.com|analytics\.google\.com|googleadservices\.com|googlesyndication\.com|doubleclick\.net)\//,
		(route) => {
			requests.push(route.request().url())
			return route.fulfill({
				contentType: 'application/javascript',
				body: '/* test stub, no external traffic */',
			})
		},
	)
	await page.route('**/api/consent-context', async (route) => {
		const response = await route.fetch()
		await route.fulfill({
			response,
			json: { ...(await response.json()), ids: { ga: id, ads: 'AW-123456789' } },
		})
	})
	return requests
}

export function readTagCommands() {
	return ((window as Window & { dataLayer?: Array<ArrayLike<unknown>> }).dataLayer ?? []).map(
		(entry) => Array.from(entry),
	)
}

export function commands(page: Page) {
	return page.evaluate(readTagCommands)
}
