import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { resolveEffectiveConsent, type SignalConsent } from '@sylphx/sdk/signal'
import { reportCheckoutReturn } from '@/features/plus/lib/checkout-return'
import { CONSENT_KEY } from '@/lib/storage-keys'
import { CHECKOUT_QUOTE_KEY, cookieConsent, setConsentContext } from './consent'
import {
	cleanEventParams,
	createGoogleTag,
	deleteGoogleCookies,
	type GoogleTagIds,
	googleCookieNames,
	googleTagIds,
	rememberCheckoutQuote,
	setActiveGoogleTag,
	type TagDocument,
	type TagWindow,
	trackablePath,
	trackCheckoutPurchase,
	trackCheckoutTrialStart,
	trackSignUp,
} from './google-tag'

const consentSignals = (choice: { analytics: boolean; marketing: boolean }) =>
	resolveEffectiveConsent({
		storedChoice: choice.marketing ? 'granted' : choice.analytics ? 'analytics_only' : 'denied',
	})

const IDS = { ga: 'G-TEST1234', ads: 'AW-123456789', adsPurchaseLabel: 'FixturePurchase' }

function harness(
	choice: { analytics: boolean; marketing: boolean },
	ids: GoogleTagIds = IDS,
	currentConsent?: () => SignalConsent,
) {
	const scripts: string[] = []
	const calls: unknown[][] = []
	const store = new Map<string, string>()
	const win = {
		location: { origin: 'https://tryit.fun', hostname: 'tryit.fun' },
		dataLayer: [] as unknown[],
		gtag: (...args: unknown[]) => calls.push(args),
	} as unknown as TagWindow
	const doc: TagDocument = {
		cookie: '',
		head: { appendChild: (node) => scripts.push((node as { src: string }).src) },
		createElement: () => ({ src: '', async: false }),
	}
	const state = { ...choice }
	const tag = createGoogleTag({
		ids,
		win,
		doc,
		consent: currentConsent ?? (() => consentSignals(state)),
	})
	return { tag, scripts, calls, state, store, win }
}

const names = (calls: unknown[][]) =>
	calls.map((c) => (c[0] === 'event' ? `event:${c[1]}` : String(c[0])))

beforeEach(() => {
	setActiveGoogleTag(null)
})

afterEach(() => {
	setActiveGoogleTag(null)
	// biome-ignore lint/suspicious/noExplicitAny: test cleanup of the stub window
	;(globalThis as any).window = undefined
})

describe('ids', () => {
	test('nothing is configured without a valid id', () => {
		expect(googleTagIds({})).toBeNull()
		expect(googleTagIds({ GA_MEASUREMENT_ID: 'nope', GOOGLE_ADS_ID: 'AW-x' })).toBeNull()
		expect(googleTagIds({ GA_MEASUREMENT_ID: ' G-ABCD1234 ' })).toEqual({
			ga: 'G-ABCD1234',
			ads: null,
			adsPurchaseLabel: null,
		})
	})
})

test('purchase label is exposed only alongside a valid Ads ID and safe label', () => {
	const config = {
		GA_MEASUREMENT_ID: IDS.ga,
		GOOGLE_ADS_ID: IDS.ads,
		GOOGLE_ADS_PURCHASE_LABEL: IDS.adsPurchaseLabel,
	}
	expect(googleTagIds(config)).toEqual(IDS)
	expect(googleTagIds({ ...config, GOOGLE_ADS_ID: 'AW-invalid' })?.adsPurchaseLabel).toBeNull()
	for (const label of ['short/path', 'a.b.c', 'a b c', 'x', 'x'.repeat(65)]) {
		expect(
			googleTagIds({ ...config, GOOGLE_ADS_PURCHASE_LABEL: label })?.adsPurchaseLabel,
		).toBeNull()
	}
})

describe('loading', () => {
	test('queues only denied defaults and never loads without permission', () => {
		const h = harness({ analytics: false, marketing: false })
		h.tag.sync()
		expect(h.tag.pageView('/', 'Home | Tryit')).toBe(false)
		expect(h.tag.event('sign_up', { method: 'email' })).toBe(false)
		expect(h.scripts).toEqual([])
		expect(h.calls).toEqual([['consent', 'default', consentSignals(h.state)]])
	})

	test('consent and page-view guards precede Google startup and config', () => {
		const h = harness({ analytics: true, marketing: true })
		h.tag.sync()
		expect(names(h.calls)).toEqual(['consent', 'set', 'set', 'js', 'config', 'config'])
		expect(h.scripts).toEqual(['https://www.googletagmanager.com/gtag/js?id=G-TEST1234'])
		expect(h.calls[1]?.[1]).toEqual({
			send_page_view: false,
			page_location: 'https://tryit.fun/',
			page_referrer: '',
			page_title: 'Tryit',
		})
		expect(h.calls[2]).toEqual(['set', 'gtm.blocklist', ['ccd_em_page_view', 'ccd_em_site_search']])
		expect(h.calls[4]?.[2]).toMatchObject({
			send_page_view: false,
			allow_google_signals: false,
			allow_ad_personalization_signals: false,
		})
		h.tag.sync()
		expect(h.scripts).toHaveLength(1)
		expect(names(h.calls).filter((n) => n === 'config')).toHaveLength(2)
	})

	test('analytics-only choice queues an analytics-only snapshot', () => {
		const h = harness({ analytics: true, marketing: false })
		h.tag.sync()
		expect(h.calls[0]).toEqual(['consent', 'default', consentSignals(h.state)])
	})

	test('analytics-only configures GA4 without Ads', () => {
		const a = harness({ analytics: true, marketing: false })
		a.tag.sync()
		expect(a.calls.filter((c) => c[0] === 'config').map((c) => c[1])).toEqual(['G-TEST1234'])
	})

	test('withdrawing denies every signal and disables the tag', () => {
		const h = harness({ analytics: true, marketing: true })
		h.tag.sync()
		h.state.analytics = false
		h.state.marketing = false
		h.tag.sync()
		const last = h.calls[h.calls.length - 1]
		expect(last?.[1]).toBe('update')
		expect(last?.[2]).toMatchObject({ ad_storage: 'denied', analytics_storage: 'denied' })
		expect(h.win['ga-disable-G-TEST1234']).toBe(true)
		expect(h.win['ga-disable-AW-123456789']).toBe(true)
		expect(h.tag.event('sign_up', { method: 'email' })).toBe(false)
	})
})

describe('page views and addresses', () => {
	test('only public paths are reported, with no query, id or locale-private part', () => {
		expect(trackablePath('/')).toBe('/')
		expect(trackablePath('/en-GB/pricing')).toBe('/pricing')
		expect(trackablePath('/delete-account')).toBe('/delete-account')
		expect(trackablePath('/zh-HK/')).toBe('/')
		expect(trackablePath('/games/sudoku')).toBeNull()
		expect(trackablePath('/share/abc123')).toBeNull()
		expect(trackablePath('/settings/subscription')).toBeNull()
		expect(trackablePath('/daily/2026-10-01')).toBeNull()
	})

	test('a private route sends nothing and resets the address', () => {
		const h = harness({ analytics: true, marketing: false })
		h.tag.sync()
		h.calls.length = 0
		expect(h.tag.pageView('/en-GB/pricing', null)).toBe(false)
		expect(h.tag.pageView('/en-GB/pricing', 'Pricing | Tryit')).toBe(true)
		expect(h.tag.pageView('/en-GB/pricing', 'Updated Pricing | Tryit')).toBe(false)
		expect(h.tag.pageView('/games/sudoku?id=secret', 'Private game title')).toBe(false)
		const events = h.calls.filter((c) => c[0] === 'event')
		expect(events).toHaveLength(1)
		expect(events[0]?.[2]).toMatchObject({
			page_location: 'https://tryit.fun/en-GB/pricing',
			page_title: 'Pricing | Tryit',
			page_referrer: '',
		})
		const sets = h.calls.filter((c) => c[0] === 'set')
		expect(sets[sets.length - 1]?.[1]).toMatchObject({ page_location: 'https://tryit.fun/' })
		expect(JSON.stringify(h.calls)).not.toMatch(/secret|Private game title/)
	})
})

describe('events', () => {
	test('go only to the destinations the visitor allowed', () => {
		const h = harness({ analytics: false, marketing: true })
		h.tag.sync()
		expect(h.tag.event('sign_up', { method: 'email' })).toBe(true)
		const event = h.calls.filter((c) => c[0] === 'event')[0]
		expect(event?.[2]).toEqual({ method: 'email', send_to: ['G-TEST1234', 'AW-123456789'] })
	})

	test('parameters carry no personal data', () => {
		expect(
			cleanEventParams({
				method: 'email',
				email: 'a@b.example',
				name: 'Ada',
				value: 39.99,
				currency: 'usd',
				transaction_id: 'cs_test_a1B2',
				plan: 'individual_yearly',
				user_id: 'not an id@x',
				items: [{ item_id: 'individual_yearly', item_name: 'x@y.z' }],
			}),
		).toEqual({
			method: 'email',
			value: 39.99,
			currency: 'USD',
			transaction_id: 'cs_test_a1B2',
			plan: 'individual_yearly',
			items: [{ item_id: 'individual_yearly' }],
		})
		expect(cleanEventParams({ user_id: 'u_abc123XYZ' })).toEqual({})
	})
})

describe('conversions', () => {
	function install(
		choice = { analytics: true, marketing: true },
		currentConsent?: () => SignalConsent,
	) {
		const h = harness(choice, IDS, currentConsent)
		h.tag.sync()
		h.calls.length = 0
		const items = new Map<string, string>()
		// biome-ignore lint/suspicious/noExplicitAny: stub browser window
		;(globalThis as any).window = {
			dispatchEvent: () => {},
			addEventListener: () => {},
			removeEventListener: () => {},
			location: { href: 'https://tryit.fun/' },
			localStorage: {
				getItem: (k: string) => items.get(k) ?? null,
				setItem: (k: string, v: string) => void items.set(k, v),
				removeItem: (k: string) => void items.delete(k),
			},
		}
		setActiveGoogleTag(h.tag)
		return { h, items }
	}
	const sent = (h: ReturnType<typeof harness>) =>
		h.calls.filter((c) => c[0] === 'event').map((c) => [c[1], c[2]])

	test('trial_start carries the post-trial price once per checkout session and clears the quote', () => {
		const { h, items } = install()
		rememberCheckoutQuote({ plan: 'individual_yearly', value: 39.99, currency: 'USD' })
		expect(trackCheckoutTrialStart({ sessionId: 'cs_test_1' })).toBe(true)
		expect(trackCheckoutTrialStart({ sessionId: 'cs_test_1' })).toBe(false)
		expect(sent(h)).toEqual([
			[
				'trial_start',
				{
					value: 39.99,
					currency: 'USD',
					plan: 'individual_yearly',
					items: [{ item_id: 'individual_yearly' }],
					send_to: ['G-TEST1234', 'AW-123456789'],
				},
			],
		])
		expect([...items.keys()].filter((k) => k.includes('checkout-quote'))).toEqual([])
	})

	test('confirmed paid return sends exactly the Ads purchase and does not resend with a new quote', () => {
		const { h, items } = install()
		const quote = { plan: 'individual_monthly', value: 4.99, currency: 'GBP' }
		rememberCheckoutQuote(quote)
		expect(items.has(CHECKOUT_QUOTE_KEY)).toBe(true)
		const paid = { sessionId: 'cs_fixture_paid_1', status: 'paid' as const }
		reportCheckoutReturn(paid)
		expect(items.has(CHECKOUT_QUOTE_KEY)).toBe(false)
		rememberCheckoutQuote(quote)
		reportCheckoutReturn(paid)
		expect(items.has(CHECKOUT_QUOTE_KEY)).toBe(false)
		expect(sent(h)).toEqual([
			[
				'conversion',
				{
					send_to: 'AW-123456789/FixturePurchase',
					value: 4.99,
					currency: 'GBP',
					transaction_id: 'cs_fixture_paid_1',
				},
			],
		])
	})

	for (const [choice, gpc] of [
		[null, false],
		['denied', false],
		['analytics_only', false],
		['granted', true],
	] as const) {
		test(`paid return drops the quote without Ads on ${choice}, gpc=${gpc}`, () => {
			const { h, items } = install(undefined, () => cookieConsent().signals)
			try {
				if (choice) items.set(CONSENT_KEY, choice)
				setConsentContext({ region: 'EEA', gpc })
				h.tag.sync()
				items.set(
					CHECKOUT_QUOTE_KEY,
					JSON.stringify({ plan: 'pass', value: 4.99, currency: 'USD' }),
				)
				reportCheckoutReturn({ status: 'paid', sessionId: 'cs_fixture_paid_2' })
				expect(sent(h)).toEqual([])
				expect(items.has(CHECKOUT_QUOTE_KEY)).toBe(false)
				expect([...items.keys()].some((key) => key.includes('paid:'))).toBe(false)
			} finally {
				setConsentContext(null)
			}
		})
	}

	test('Ads purchase checks both consent signals again even after Ads is loaded', () => {
		const choice = { ...consentSignals({ analytics: true, marketing: true }) }
		const { h } = install(undefined, () => choice)
		for (const signal of ['ad_storage', 'ad_user_data'] as const) {
			choice[signal] = 'denied'
			expect(h.tag.adsPurchase({ value: 1, currency: 'usd', transactionId: 'cs_fixture' })).toBe(
				false,
			)
			choice[signal] = 'granted'
		}
		expect(sent(h)).toEqual([])
	})

	test('Ads purchase is inert before tag load, with bad fields, or without a label', () => {
		const h = harness({ analytics: true, marketing: true })
		const payload = { value: 1, currency: 'USD', transactionId: 'cs_fixture' }
		expect(h.tag.adsPurchase(payload)).toBe(false)
		h.tag.sync()
		for (const input of [
			{ value: Infinity },
			{ value: 0 },
			{ currency: 'USD-private' },
			{ transactionId: 'user@example.test' },
		]) {
			expect(h.tag.adsPurchase({ ...payload, ...input })).toBe(false)
		}
		const noLabel = harness(h.state, { ...IDS, adsPurchaseLabel: null })
		noLabel.tag.sync()
		expect(noLabel.tag.adsPurchase(payload)).toBe(false)
		expect(sent(h)).toEqual([])
		expect(sent(noLabel)).toEqual([])
	})

	test('no purchase is sent when the dedup marker cannot be saved', () => {
		const { h } = install()
		rememberCheckoutQuote({ plan: 'pass', value: 5, currency: 'USD' })
		window.localStorage.setItem = () => {
			throw new Error('storage blocked')
		}
		expect(trackCheckoutPurchase({ sessionId: 'cs_fixture' })).toBe(false)
		expect(sent(h)).toEqual([])
	})

	test('without consent nothing is stored or sent, and the quote is not consumed', () => {
		const { h, items } = install({ analytics: false, marketing: false })
		rememberCheckoutQuote({ plan: 'individual_yearly', value: 39.99, currency: 'USD' })
		expect(items.size).toBe(0)
		expect(trackCheckoutTrialStart({ sessionId: 'cs_test_2' })).toBe(false)
		expect(sent(h)).toEqual([])
	})

	test('no quote or a malformed session id fires nothing', () => {
		const { h } = install()
		expect(trackCheckoutTrialStart({ sessionId: 'cs_test_3' })).toBe(false)
		rememberCheckoutQuote({ plan: 'individual_yearly', value: 39.99, currency: 'USD' })
		expect(trackCheckoutTrialStart({ sessionId: 'x y@z' })).toBe(false)
		expect(sent(h)).toEqual([])
	})

	test('sign_up sends the method only', () => {
		const { h } = install()
		expect(trackSignUp('email')).toBe(true)
		expect(sent(h)[0]).toEqual([
			'sign_up',
			{ method: 'email', send_to: ['G-TEST1234', 'AW-123456789'] },
		])
	})

	test('with no tag configured the helpers are inert', () => {
		setActiveGoogleTag(null)
		expect(trackSignUp('email')).toBe(false)
		expect(trackCheckoutTrialStart({ sessionId: 'cs_test_4' })).toBe(false)
	})
})

describe('cookies', () => {
	test('Google cookies are found and expired on the host and parents', () => {
		const doc = { cookie: '_ga=1; _ga_ABC123=2; _gcl_au=3; puzzled_attr=x; theme=dark' }
		expect(googleCookieNames(doc.cookie)).toEqual(['_ga', '_ga_ABC123', '_gcl_au'])
		const writes: string[] = []
		deleteGoogleCookies(
			{
				get cookie() {
					return doc.cookie
				},
				set cookie(v: string) {
					writes.push(v)
				},
			},
			'www.tryit.fun',
		)
		expect(writes).toContain('_ga=; Path=/; Max-Age=0')
		expect(writes).toContain('_ga=; Path=/; Max-Age=0; Domain=.tryit.fun')
		expect(writes.some((w) => w.startsWith('puzzled_attr') || w.startsWith('theme'))).toBe(false)
	})
})

describe('config privacy flags', () => {
	test('Ads config turns off personalization signals and enhanced conversions', () => {
		const h = harness({ analytics: false, marketing: true })
		h.tag.sync()
		const cfg = h.calls.find((c) => c[0] === 'config' && c[1] === IDS.ads)
		expect(cfg?.[2]).toMatchObject({
			allow_google_signals: false,
			allow_ad_personalization_signals: false,
			allow_enhanced_conversions: false,
		})
	})
})
