import { expect, test } from 'bun:test'
import { CONSENT_KEY, MARKETING_CONSENT_KEY } from '@/lib/storage-keys'
import {
	cookieConsent,
	hasAnalyticsConsent,
	resolveConsent,
	saveCookieChoice,
	setConsentContext,
} from './consent'

const statuses = ['pending', 'accepted', 'declined'] as const

test('region, explicit choices, either GPC signal and storage availability compose fail-closed', () => {
	for (const region of ['eea', 'non-eea'] as const) {
		for (const status of statuses) {
			for (const marketing of statuses) {
				for (const httpGpc of [true, false]) {
					for (const browserGpc of [true, false]) {
						for (const ready of [true, false]) {
							for (const storageAvailable of [true, false]) {
								const gpc = browserGpc || (ready && httpGpc)
								const allowed = ready && storageAvailable && !gpc
								expect(
									resolveConsent({
										context: ready ? { region, gpc: httpGpc } : null,
										browserGpc,
										status,
										marketing,
										storageAvailable,
									}),
								).toMatchObject({
									analytics:
										allowed &&
										(status === 'accepted' || (status === 'pending' && region === 'non-eea')),
									marketing: allowed && status === 'accepted' && marketing === 'accepted',
									prompt: allowed && region === 'eea' && status === 'pending',
									gpc,
									ready,
								})
							}
						}
					}
				}
			}
		}
	}
})

test('analytics-only accept, persistent decline and non-EEA default retain the explicit integration gate', () => {
	const globals = globalThis as unknown as { window?: unknown }
	const entries = new Map<string, string>()
	globals.window = {
		dispatchEvent: () => {},
		localStorage: {
			getItem: (key: string) => entries.get(key) ?? null,
			setItem: (key: string, value: string) => entries.set(key, value),
			removeItem: (key: string) => entries.delete(key),
		},
		sessionStorage: { removeItem: () => {} },
	}
	try {
		setConsentContext({ region: 'non-eea', gpc: false })
		expect(cookieConsent().analytics).toBe(true)
		expect(hasAnalyticsConsent()).toBe(false)
		saveCookieChoice('declined')
		expect(entries.get(CONSENT_KEY)).toBe('declined')
		expect(cookieConsent().analytics).toBe(false)
		saveCookieChoice('accepted')
		expect(hasAnalyticsConsent()).toBe(true)
		expect(entries.get(MARKETING_CONSENT_KEY)).toBe('declined')
		setConsentContext({ region: 'non-eea', gpc: true })
		saveCookieChoice('accepted')
		expect(hasAnalyticsConsent()).toBe(false)
	} finally {
		setConsentContext(null)
		globals.window = undefined
	}
})
