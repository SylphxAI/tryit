import { describe, expect, test } from 'bun:test'
import {
	isInstallOfferEligible,
	isServerDayCurrent,
	shouldShowInstallOffer,
} from './pwa-install-policy'

const base = { firstFinishDay: '2026-10-01', today: '2026-10-02', pathname: '/' }

describe('install offer eligibility', () => {
	test('needs a finished day on an earlier product day', () => {
		expect(isInstallOfferEligible(base)).toBe(true)
		expect(isInstallOfferEligible({ ...base, firstFinishDay: null })).toBe(false)
		expect(isInstallOfferEligible({ ...base, today: '2026-10-01' })).toBe(false)
	})
	test('never on a game page or the daily result, in any locale', () => {
		for (const pathname of ['/games/sudoku', '/zh-HK/games/sudoku', '/daily', '/en-GB/daily']) {
			expect(isInstallOfferEligible({ ...base, pathname })).toBe(false)
		}
		expect(isInstallOfferEligible({ ...base, pathname: '/zh-HK/stats' })).toBe(true)
	})
})

describe('install offer gate', () => {
	const gates = {
		eligible: true,
		standalone: false,
		requested: true,
		primaryActionVisible: false,
	}

	test('waits while the day primary action is on screen', () => {
		// The offer is docked above the tab bar: over the play button it would
		// cover the day's primary action.
		expect(shouldShowInstallOffer(gates)).toBe(true)
		expect(shouldShowInstallOffer({ ...gates, primaryActionVisible: true })).toBe(false)
	})

	test('still needs eligibility, a request and a non-standalone window', () => {
		expect(shouldShowInstallOffer({ ...gates, eligible: false })).toBe(false)
		expect(shouldShowInstallOffer({ ...gates, requested: false })).toBe(false)
		expect(shouldShowInstallOffer({ ...gates, standalone: true })).toBe(false)
	})
})

test('the server day key is current until the Hong Kong reset, never past it', () => {
	const resetAt = Date.parse('2026-10-02T16:00:00Z')
	const day = { dayKey: '2026-10-02', servedAt: resetAt - 1000, resetAt, clientNow: 0 }
	expect(isServerDayCurrent({ ...day, sinceMountMs: 999 })).toBe(true)
	expect(isServerDayCurrent({ ...day, sinceMountMs: 1000 })).toBe(false)
	expect(isServerDayCurrent({ ...day, sinceMountMs: 0, clientNow: resetAt })).toBe(false)
	expect(isServerDayCurrent({ ...day, sinceMountMs: 0, dayKey: undefined })).toBe(false)
})
