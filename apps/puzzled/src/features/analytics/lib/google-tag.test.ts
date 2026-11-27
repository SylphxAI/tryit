import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { resolveEffectiveConsent, type SignalConsent } from '@sylphx/sdk/signal'
import { reportCheckoutReturn } from '@/features/plus/lib/checkout-return'
import { getGameSlugs } from '@/games/registry'
import { gamePath } from '@/lib/game-slug'
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
	landing?: { search: string; referrer: string },
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
		landing,
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
		expect(trackablePath('/games/')).toBe('/games')
		expect(trackablePath('/games/sudoku')).toBe('/games/sudoku')
		expect(trackablePath('/en-GB/games/word-guess/?email=private%40example.test#secret')).toBe(
			'/games/word-guess',
		)
		for (const slug of getGameSlugs()) {
			const landing = gamePath(slug)
			expect(trackablePath(landing)).toBe(landing)
		}
		expect(trackablePath('/games/quartet')).toBe('/games/quartet')
	})

	test('a private route sends nothing and resets the address', () => {
		const h = harness({ analytics: true, marketing: false })
		h.tag.sync()
		h.calls.length = 0
		expect(h.tag.pageView('/en-GB/pricing', null)).toBe(false)
		expect(h.tag.pageView('/en-GB/pricing', 'Pricing | Tryit')).toBe(true)
		expect(h.tag.pageView('/en-GB/pricing', 'Updated Pricing | Tryit')).toBe(false)
		expect(
			h.tag.pageView(
				'/en-GB/games/word-guess/?email=private%40example.test#secret',
				'Five | Tryit',
			),
		).toBe(true)
		for (const path of [
			'/games/not-a-game',
			'/games/sudoku/foo',
			'/games/constructor',
			'/games/queens',
			'/games/word-groups',
			'/share/abc123',
			'/settings',
			'/settings/subscription',
			'/profile',
			'/stats',
			'/archive',
			'/daily/2026-10-01',
			'/family/join',
			'/admin',
		]) {
			expect(trackablePath(path)).toBeNull()
			expect(h.tag.pageView(`${path}?id=secret`, 'Private game title')).toBe(false)
			expect(h.calls.at(-1)).toEqual([
				'set',
				{ page_location: 'https://tryit.fun/', page_referrer: '', page_title: 'Tryit' },
			])
		}
		const events = h.calls.filter((c) => c[0] === 'event')
		expect(events).toHaveLength(2)
		expect(events[0]?.[2]).toMatchObject({
			page_location: 'https://tryit.fun/en-GB/pricing',
			page_title: 'Pricing | Tryit',
			page_referrer: '',
		})
		expect(events[1]?.[2]).toMatchObject({
			page_location: 'https://tryit.fun/en-GB/games/word-guess',
			page_title: 'Five | Tryit',
			page_referrer: '',
		})
		expect(JSON.stringify(h.calls)).not.toMatch(
			/private%40|example\.test|secret|Private game title/,
		)
	})
})

describe('landing attribution', () => {
	const AD_LANDING = {
		search:
			'?utm_source=google&utm_medium=cpc&utm_campaign=spring&utm_term=logic&utm_content=a1' +
			'&utm_id=42&gclid=TEST123&gbraid=GB1&wbraid=WB1&junk=x&email=private%40example.test&fbclid=F',
		referrer: 'https://www.google.com/search/path?q=private+query#frag',
	}
	const pageViews = (calls: unknown[][]) =>
		calls.filter((c) => c[0] === 'event' && c[1] === 'page_view').map((c) => c[2])

	test('the first page view keeps only allowlisted params and the external referrer origin and path', () => {
		const h = harness({ analytics: true, marketing: true }, IDS, undefined, AD_LANDING)
		h.tag.sync()
		expect(h.tag.pageView('/', 'Home | Tryit')).toBe(true)
		const first = pageViews(h.calls)[0] as Record<string, string>
		const url = new URL(first.page_location ?? '')
		expect(`${url.origin}${url.pathname}`).toBe('https://tryit.fun/')
		expect([...url.searchParams.keys()]).toEqual([
			'utm_source',
			'utm_medium',
			'utm_campaign',
			'utm_term',
			'utm_content',
			'utm_id',
			'gclid',
			'gbraid',
			'wbraid',
		])
		expect(url.searchParams.get('gclid')).toBe('TEST123')
		expect(url.hash).toBe('')
		expect(first.page_referrer).toBe('https://www.google.com/search/path')
		expect(JSON.stringify(h.calls)).not.toMatch(/junk|email|private|example\.test|fbclid|frag/)

		expect(h.tag.pageView('/games', 'Games | Tryit')).toBe(true)
		expect(pageViews(h.calls)[1]).toMatchObject({
			page_location: 'https://tryit.fun/games',
			page_referrer: '',
		})
		expect(h.calls.at(-2)).toEqual([
			'set',
			{ page_location: 'https://tryit.fun/games', page_referrer: '', page_title: 'Games | Tryit' },
		])
	})

	test('consent after SPA navigation still attributes the first view sent', () => {
		const h = harness({ analytics: false, marketing: false }, IDS, undefined, AD_LANDING)
		h.tag.sync()
		expect(h.tag.pageView('/', 'Home | Tryit')).toBe(false)
		h.state.analytics = true
		h.state.marketing = true
		h.tag.sync()
		expect(h.tag.pageView('/games', 'Games | Tryit')).toBe(true)
		expect(pageViews(h.calls)[0]).toMatchObject({
			page_location:
				'https://tryit.fun/games?utm_source=google&utm_medium=cpc&utm_campaign=spring' +
				'&utm_term=logic&utm_content=a1&utm_id=42&gclid=TEST123&gbraid=GB1&wbraid=WB1',
			page_referrer: 'https://www.google.com/search/path',
		})
	})

	test('analytics-only consent keeps campaign params but never sends ad click ids', () => {
		const h = harness({ analytics: true, marketing: false }, IDS, undefined, AD_LANDING)
		h.tag.sync()
		expect(h.tag.pageView('/', 'Home | Tryit')).toBe(true)
		expect(pageViews(h.calls)[0]).toMatchObject({
			page_location:
				'https://tryit.fun/?utm_source=google&utm_medium=cpc&utm_campaign=spring' +
				'&utm_term=logic&utm_content=a1&utm_id=42',
			page_referrer: 'https://www.google.com/search/path',
		})
		expect(JSON.stringify(h.calls)).not.toMatch(/gclid|gbraid|wbraid|TEST123[^4]|GB1|WB1/)
	})

	test('a same-origin or non-http referrer and an email-like value are not sent', () => {
		for (const referrer of ['https://tryit.fun/games?x=1', 'android-app://x', 'not a url', '']) {
			const h = harness({ analytics: true, marketing: false }, IDS, undefined, {
				search: '?utm_source=a%40b.test&utm_medium=cpc',
				referrer,
			})
			h.tag.sync()
			h.tag.pageView('/', 'Home | Tryit')
			expect(pageViews(h.calls)[0]).toMatchObject({
				page_location: 'https://tryit.fun/?utm_medium=cpc',
				page_referrer: '',
			})
		}
	})

	for (const [label, signals] of [
		['refused', resolveEffectiveConsent({ storedChoice: 'denied' })],
		['GPC', resolveEffectiveConsent({ region: 'ROW', gpc: true, storedChoice: 'granted' })],
	] as const) {
		test(`${label} sends no gtag event and loads nothing`, () => {
			const h = harness({ analytics: false, marketing: false }, IDS, () => signals, AD_LANDING)
			h.tag.sync()
			expect(h.tag.pageView('/', 'Home | Tryit')).toBe(false)
			expect(h.tag.pageView('/games', 'Games | Tryit')).toBe(false)
			expect(h.scripts).toEqual([])
			expect(h.calls.filter((c) => c[0] !== 'consent')).toEqual([])
		})
	}
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
		const paid = { orderId: 'pi_fixture_paid_1', value: 12.34, currency: 'USD' }
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
					value: 12.34,
					currency: 'USD',
					transaction_id: 'pi_fixture_paid_1',
				},
			],
		])
	})

	test.each([
		'puzzled:ads:sent:paid:pi_fixture_paid_legacy',
		'puzzled:ads:conversion:paid:pi_fixture_paid_legacy',
		'puzzled:ads:sent:paid:cs_fixture_legacy',
		'puzzled:ads:conversion:paid:cs_fixture_legacy',
	])('a paid return with %s already recorded sends nothing and clears the quote', (marker) => {
		const { h, items } = install()
		const paid = { orderId: 'pi_fixture_paid_legacy', value: 7, currency: 'USD' }
		const sessionId = 'cs_fixture_legacy'
		items.set(marker, '1')
		rememberCheckoutQuote({ plan: 'pass', value: 4.99, currency: 'USD' })
		expect(trackCheckoutPurchase(paid, sessionId)).toBe(false)
		reportCheckoutReturn(paid, sessionId)
		expect(sent(h)).toEqual([])
		expect([...items]).toEqual([[marker, '1']])
	})

	test('a new paid return reserves only its order marker even with a legacy session ID', () => {
		const { h, items } = install()
		const paid = { orderId: 'pi_fixture_paid_new', value: 7, currency: 'USD' }
		expect(trackCheckoutPurchase(paid, 'cs_fixture_new')).toBe(true)
		expect(trackCheckoutPurchase(paid, 'cs_fixture_new')).toBe(false)
		expect(sent(h)).toHaveLength(1)
		expect([...items]).toEqual([['puzzled:ads:sent:paid:pi_fixture_paid_new', '1']])
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
				reportCheckoutReturn({ orderId: 'pi_fixture_paid_2', value: 7, currency: 'USD' })
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
		expect(trackCheckoutPurchase({ orderId: 'pi_fixture', value: 5, currency: 'USD' })).toBe(false)
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
