import { afterEach, describe, expect, test } from 'bun:test'
import { CONSENT_KEY } from '@/lib/storage-keys'
import { ENTRY_SURFACE_KEY } from './checkout-entry-surface'
import { setConsentContext } from './consent'
import { trackGa4KeyEvent } from './ga4-key-events'
import { createGoogleTag, setActiveGoogleTag, type TagWindow } from './google-tag'

const g = globalThis as unknown as Record<string, unknown>

function installBrowserStubs() {
	const localItems = new Map<string, string>()
	const sessionItems = new Map<string, string>()
	const gtagCalls: unknown[][] = []
	const gtag = (...args: unknown[]) => {
		if (args[0] === 'event') gtagCalls.push(args)
	}
	const localStorage = {
		getItem: (k: string) => localItems.get(k) ?? null,
		setItem: (k: string, v: string) => void localItems.set(k, v),
		removeItem: (k: string) => void localItems.delete(k),
	}
	const sessionStorage = {
		getItem: (k: string) => sessionItems.get(k) ?? null,
		setItem: (k: string, v: string) => void sessionItems.set(k, v),
		removeItem: (k: string) => void sessionItems.delete(k),
	}
	g.localStorage = localStorage
	g.sessionStorage = sessionStorage
	g.window = {
		gtag,
		addEventListener: () => {},
		removeEventListener: () => {},
		location: { href: 'https://tryit.fun/', origin: 'https://tryit.fun', hostname: 'tryit.fun' },
		dispatchEvent: () => {},
		localStorage,
		sessionStorage,
	}
	setConsentContext({ region: 'EEA', gpc: false })
	const tag = createGoogleTag({
		ids: { ga: 'G-TEST1234', ads: null },
		win: g.window as TagWindow,
		doc: {
			cookie: '',
			head: { appendChild: () => {} },
			createElement: () => ({ src: '', async: false }),
		},
		consent: () => ({
			analytics_storage: 'granted',
			ad_storage: 'denied',
			ad_user_data: 'denied',
			ad_personalization: 'denied',
		}),
	})
	tag.sync()
	setActiveGoogleTag(tag)
	return { localItems, sessionItems, gtagCalls }
}

describe('trackGa4KeyEvent', () => {
	afterEach(() => {
		setActiveGoogleTag(null)
		setConsentContext(null)
		g.window = undefined
		g.localStorage = undefined
		g.sessionStorage = undefined
	})

	test('pre-consent (pending or declined) emits 0 gtag calls even when window.gtag exists', () => {
		const { localItems, sessionItems, gtagCalls } = installBrowserStubs()

		// A queued tag does not imply permission.
		expect(trackGa4KeyEvent('sign_up', { method: 'email' })).toBe(false)
		expect(
			trackGa4KeyEvent('begin_checkout', {
				plan: 'plus',
				plan_sku: 'individual_yearly',
				billing_interval: 'year',
				checkout_trigger: 'pricing_card',
				option: 'subscription',
			}),
		).toBe(false)

		// Explicitly declined
		localItems.set(CONSENT_KEY, 'denied')
		expect(trackGa4KeyEvent('sign_up', { method: 'oauth' })).toBe(false)

		expect(gtagCalls).toEqual([])
		expect(sessionItems.size).toBe(0)
	})

	test('returns false when there is no active GA destination', () => {
		const { localItems } = installBrowserStubs()
		localItems.set(CONSENT_KEY, 'granted')
		setActiveGoogleTag(null)
		expect(trackGa4KeyEvent('sign_up', { method: 'email' })).toBe(false)
	})

	test('post-consent emits sign_up and begin_checkout with custom dimensions', () => {
		const { localItems, sessionItems, gtagCalls } = installBrowserStubs()
		localItems.set(CONSENT_KEY, 'granted')
		sessionItems.set(ENTRY_SURFACE_KEY, 'seo_daily-word-and-logic-puzzles-online')

		expect(trackGa4KeyEvent('sign_up', { method: 'oauth' })).toBe(true)
		expect(
			trackGa4KeyEvent('begin_checkout', {
				plan: 'plus',
				plan_sku: 'individual_yearly',
				billing_interval: 'year',
				checkout_trigger: 'pricing_card',
				option: 'subscription',
			}),
		).toBe(true)

		expect(gtagCalls).toEqual([
			[
				'event',
				'sign_up',
				{
					send_to: 'G-TEST1234',
					method: 'oauth',
					entry_surface: 'seo_daily-word-and-logic-puzzles-online',
				},
			],
			[
				'event',
				'begin_checkout',
				{
					send_to: 'G-TEST1234',
					plan: 'plus',
					plan_sku: 'individual_yearly',
					billing_interval: 'year',
					checkout_trigger: 'pricing_card',
					option: 'subscription',
					entry_surface: 'seo_daily-word-and-logic-puzzles-online',
				},
			],
		])
	})

	test('strips undefined, empty, and PII fields', () => {
		const { localItems, gtagCalls } = installBrowserStubs()
		localItems.set(CONSENT_KEY, 'granted')

		expect(
			trackGa4KeyEvent('begin_checkout', {
				plan: 'plus',
				plan_sku: undefined,
				billing_interval: 'month',
				checkout_trigger: '',
				entry_surface: 'user@example.com',
				option: 'subscription',
				email: 'user@example.com',
				name: 'Ada Lovelace',
				user_id: 'u_secret',
				session_id: 'ses_secret',
			}),
		).toBe(true)

		expect(gtagCalls).toEqual([
			[
				'event',
				'begin_checkout',
				{
					send_to: 'G-TEST1234',
					plan: 'plus',
					billing_interval: 'month',
					option: 'subscription',
				},
			],
		])
	})

	test('falls back to the checkout trigger instead of sending arbitrary inbound attribution', () => {
		const { localItems, sessionItems, gtagCalls } = installBrowserStubs()
		localItems.set(CONSENT_KEY, 'granted')
		sessionItems.set(ENTRY_SURFACE_KEY, 'Ada-Lovelace-12345678')
		expect(
			trackGa4KeyEvent('begin_checkout', {
				entry_surface: 'Ada Lovelace',
				checkout_trigger: 'game_unlock',
				value: 39.99,
				currency: 'gbp',
			}),
		).toBe(true)
		expect(gtagCalls).toEqual([
			[
				'event',
				'begin_checkout',
				{
					send_to: 'G-TEST1234',
					entry_surface: 'game_unlock',
					checkout_trigger: 'game_unlock',
					value: 39.99,
					currency: 'GBP',
				},
			],
		])
	})
})
