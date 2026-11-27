import { expect, test } from 'bun:test'
import { scrubbedReturnHref, scrubCheckoutSession, subscriptionReturn } from './subscription-return'

function fakeWindow(href: string) {
	const calls: [unknown, string][] = []
	const win = {
		location: { href },
		history: {
			state: { _depth: 3 },
			replaceState(state: unknown, _unused: string, url: string) {
				calls.push([state, url])
				win.location.href = new URL(url, href).href
			},
		},
	}
	return { win, calls }
}

for (const key of ['s', 'session_id', 'checkout_session_id']) {
	test(`the ${key} checkout session id leaves the address; the return state stays`, () => {
		const href = `https://tryit.fun/ja/settings/subscription?checkout=success&${key}=cs_live_Fixture-1&callbackUrl=%2Fgames%2Fsudoku#plan`
		const { win, calls } = fakeWindow(href)
		expect(subscriptionReturn(new URL(href).searchParams).session).toBe('cs_live_Fixture-1')
		expect(scrubCheckoutSession(win)).toBe(true)
		expect(calls).toEqual([
			[
				{ _depth: 3 },
				'/ja/settings/subscription?checkout=success&callbackUrl=%2Fgames%2Fsudoku#plan',
			],
		])
		// What a tag reading `location` afterwards would see.
		expect(win.location.href).not.toContain('cs_live_Fixture-1')
		const after = subscriptionReturn(new URL(win.location.href).searchParams)
		expect(after).toMatchObject({ session: null, fromCheckout: true, callbackUrl: '/games/sudoku' })
	})
}

test('an address without a session id is left alone', () => {
	const { win, calls } = fakeWindow('https://tryit.fun/settings/subscription?checkout=success')
	expect(scrubCheckoutSession(win)).toBe(false)
	expect(calls).toEqual([])
	expect(scrubbedReturnHref('https://tryit.fun/settings/subscription')).toBeNull()
})
