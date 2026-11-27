import { afterEach, expect, test } from 'bun:test'
import { resolveEffectiveConsent } from '@sylphx/sdk/signal'
import { buildCsp } from '@/lib/csp'
import { signalStreamConfig } from '@/lib/signal-config'
import { CONSENT_KEY, CONSENT_VERSION_KEY } from '@/lib/storage-keys'
import { GET } from '@/routes/api/consent-context'
import { checkoutSignalHeaders, setCheckoutMeasurementId } from './checkout-signal'
import {
	CONSENT_VERSION,
	canUseMeta,
	captureSignalTouch,
	cookieConsent,
	saveCookieChoice,
	setConsentContext,
	trackSignalPage,
} from './consent'

const realFetch = globalThis.fetch
const globals = globalThis as unknown as Record<string, unknown>
const navigatorGpc = Object.getOwnPropertyDescriptor(navigator, 'globalPrivacyControl')
const denied = 'denied,denied,denied,denied'
const analytics = 'granted,denied,denied,denied'
const full = 'granted,granted,granted,granted'
const analyticsFields = {
	ga_client_id: '12345.67890',
	ga_session_id: '1234567890',
	utm_source: 'fixture',
}

function browser(legacy?: string) {
	const store = new Map<string, string>()
	if (legacy) store.set('puzzled:consent:cookie', legacy)
	globals.window = {
		location: {
			href: 'https://tryit.fun/pricing?gclid=fixture_g&fbclid=fixture_fb&utm_source=fixture&email=private',
		},
		localStorage: {
			getItem: (k: string) => store.get(k) ?? null,
			setItem: store.set.bind(store),
			removeItem: store.delete.bind(store),
		},
		addEventListener: () => {},
		removeEventListener: () => {},
		dispatchEvent: () => {},
	}
	globals.document = {
		cookie:
			'_ga=GA1.1.12345.67890; _ga_TEST1234=GS2.1.s1234567890$o1; _fbp=fb.1.1234567890.444; session=private',
	}
	setCheckoutMeasurementId('G-TEST1234')
	return store
}

async function context(country?: string, gpc?: string) {
	const headers = new Headers()
	if (country) headers.set('CF-IPCountry', country)
	if (gpc) headers.set('Sec-GPC', gpc)
	const response = GET({
		request: new Request('https://tryit.fun/api/consent-context', { headers }),
	})
	expect(response.headers.get('Cache-Control')).toBe('private, no-store')
	setConsentContext(await response.json())
}

function snapshot() {
	const headers: Partial<Record<string, string>> = checkoutSignalHeaders('pricing_card')
	const encoded = headers['x-puzzled-signal-attribution']
	return {
		consent: headers['x-puzzled-signal-consent'],
		fields: encoded ? JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) : null,
		surface: headers['x-puzzled-entry-surface'],
	}
}

afterEach(() => {
	setConsentContext(null)
	globalThis.fetch = realFetch
	globals.window = undefined
	globals.document = undefined
	if (navigatorGpc) Object.defineProperty(navigator, 'globalPrivacyControl', navigatorGpc)
	else Reflect.deleteProperty(navigator, 'globalPrivacyControl')
})

for (const country of ['US', 'CA', 'AU']) {
	test(`${country} defaults to complete SDK consent, Google and Meta attribution`, async () => {
		browser()
		await context(country)
		const all = {
			ga_client_id: '12345.67890',
			ga_session_id: '1234567890',
			gclid: 'fixture_g',
			utm_source: 'fixture',
			fbclid: 'fixture_fb',
			fbp: 'fb.1.1234567890.444',
			fbc: expect.stringMatching(/^fb\.1\.\d+\.fixture_fb$/),
		}
		// ROW: Meta is eligible by default, like Google's click ids.
		expect(snapshot()).toEqual({ consent: full, surface: 'pricing_card', fields: all })
		expect(canUseMeta()).toBe(true)
	})

	test(`${country} with Sec-GPC or a saved opt-out sends no Meta ids`, async () => {
		browser()
		await context(country, '1')
		expect(canUseMeta()).toBe(false)
		expect(snapshot().fields).toBeNull()
		const store = browser()
		await context(country)
		saveCookieChoice('denied')
		expect(store.get(CONSENT_KEY)).toBe('denied')
		expect(canUseMeta()).toBe(false)
		expect(snapshot().fields).toBeNull()
	})
}

for (const country of ['DE', 'GB', 'CH', 'XX', undefined]) {
	test(`${String(country)} grant saved before the Meta consent version keeps Google, not Meta`, async () => {
		const store = browser()
		store.set(CONSENT_KEY, 'granted')
		await context(country)
		const google = {
			ga_client_id: '12345.67890',
			ga_session_id: '1234567890',
			gclid: 'fixture_g',
			utm_source: 'fixture',
		}
		// No banner wall: the old grant still counts for everything but Meta.
		expect(cookieConsent().prompt).toBe(false)
		expect(snapshot()).toEqual({ consent: full, surface: 'pricing_card', fields: google })
		expect(canUseMeta()).toBe(false)
		store.set(CONSENT_VERSION_KEY, '2026-11-26')
		expect(canUseMeta()).toBe(false)
		saveCookieChoice('granted')
		expect(store.get(CONSENT_VERSION_KEY)).toBe(CONSENT_VERSION)
		expect(canUseMeta()).toBe(true)
		expect(snapshot().fields.fbp).toBe('fb.1.1234567890.444')
	})

	test(`${String(country)} unset stays strictly opt-in for Meta`, async () => {
		browser()
		await context(country)
		expect(canUseMeta()).toBe(false)
	})
}

for (const country of ['DE', 'GB', 'CH', 'XX', 'SU', 'US, US', undefined]) {
	test(`${String(country)} fails closed until explicit opt-in`, async () => {
		browser()
		await context(country)
		expect(snapshot()).toEqual({ consent: denied, fields: null, surface: undefined })
		expect(cookieConsent().prompt).toBe(true)
		saveCookieChoice('granted')
		expect(snapshot().consent).toBe(full)
	})
}

for (const country of ['AX', 'GF', 'GP', 'MQ', 'MF', 'RE', 'YT']) {
	test(`${country} requires opt-in and persists analytics-only without ad identifiers`, async () => {
		// Check the SDK directly, so the route's territory fallback cannot mask a regression.
		expect(Object.values(resolveEffectiveConsent({ region: country })).join(',')).toBe(denied)
		const store = browser()
		await context(country)
		expect(cookieConsent().prompt).toBe(true)
		expect(snapshot()).toEqual({ consent: denied, fields: null, surface: undefined })

		saveCookieChoice('analytics_only')
		await context(country)
		expect(store.get(CONSENT_KEY)).toBe('analytics_only')
		expect(cookieConsent().prompt).toBe(false)
		expect(snapshot()).toEqual({
			consent: analytics,
			fields: analyticsFields,
			surface: 'pricing_card',
		})
	})
}

test('retains legacy analytics-only consent without retaining ad identifiers', async () => {
	const store = browser('accepted')
	await context('US')
	expect(store.get(CONSENT_KEY)).toBe('analytics_only')
	expect(snapshot()).toEqual({
		consent: analytics,
		surface: 'pricing_card',
		fields: analyticsFields,
	})
	expect(store.get('puzzled:signal.touch')).not.toMatch(/fixture_g|fixture_fb/)
})

test('declining is persistent and clears the campaign touch', async () => {
	const store = browser()
	await context('US')
	saveCookieChoice('denied')
	await context('CA')
	expect(store.get(CONSENT_KEY)).toBe('denied')
	expect(store.has('puzzled:signal.touch')).toBe(false)
	expect(snapshot()).toEqual({ consent: denied, fields: null, surface: undefined })
})

for (const gpc of ['header', 'browser']) {
	test(`${gpc} GPC overrides even a stored grant`, async () => {
		const store = browser()
		store.set(CONSENT_KEY, 'granted')
		if (gpc === 'browser')
			Object.defineProperty(navigator, 'globalPrivacyControl', { value: true, configurable: true })
		await context('AU', gpc === 'header' ? '0, 1' : undefined)
		expect(snapshot()).toEqual({ consent: denied, fields: null, surface: undefined })
		expect(store.has('puzzled:signal.touch')).toBe(false)
	})
}

const campaign = {
	gclid: 'fixture_g',
	gbraid: 'fixture_gb',
	wbraid: 'fixture_wb',
	fbclid: 'fixture_fb',
	utm_source: 'fixture_source',
	utm_medium: 'fixture_medium',
	utm_campaign: '促銷',
	utm_term: 'fixture_term',
	utm_content: 'fixture_content',
}
const stream = { apiKey: 'sylphx_pk_local_fixture', baseUrl: 'https://signal.example.test' }

function signalBrowser() {
	const store = browser()
	const win = globals.window as { location: { href: string } }
	const navigate = (path: string) => {
		win.location.href = `https://tryit.fun${path}`
	}
	navigate(
		`/pricing?${new URLSearchParams({ ...campaign, next: 'private', utm_id: 'fixture_extra' })}`,
	)
	const requests: Array<{
		url: string
		init?: RequestInit
		body: {
			consent: string
			events: Array<{
				event_id: string
				event_name: string
				session_id: string
				properties: Record<string, unknown>
			}>
		}
	}> = []
	globalThis.fetch = (async (url, init) => {
		requests.push({ url: String(url), init, body: JSON.parse(String(init?.body)) })
		return new Response(null, { status: 403 }) // The scoped platform key may still be pending.
	}) as typeof fetch
	return { store, requests, navigate }
}

test('Wave 1 stays off without a saved grant; EEA never captures the pre-grant landing', () => {
	const { store, requests, navigate } = signalBrowser()
	setConsentContext({ region: 'EEA', gpc: false, stream })
	trackSignalPage('/pricing')
	expect(captureSignalTouch()).toEqual({})
	expect(store.size).toBe(0)
	navigate('/')
	saveCookieChoice('granted')
	trackSignalPage('/')
	expect(requests.map((req) => req.body.events[0].properties)).toEqual([{ path: '/' }])
	expect(store.has('puzzled:signal.touch')).toBe(false)
})

test('ROW checkout defaults do not enable the opt-in SPA stream', () => {
	const { requests } = signalBrowser()
	setConsentContext({ region: 'ROW', gpc: false, stream })
	trackSignalPage('/pricing')
	expect(requests).toHaveLength(0)
	expect(snapshot().fields).toMatchObject(campaign)
})

for (const choice of ['analytics_only', 'granted'] as const) {
	test(`SPA capture of all nine requested fields respects ${choice} and dedups views, touches and session`, () => {
		const { store, requests, navigate } = signalBrowser()
		setConsentContext({ region: 'EEA', gpc: false, stream })
		saveCookieChoice(choice)
		const initialTouch = store.get('puzzled:signal.touch') ?? ''
		for (let i = 0; i < 3; i++) {
			captureSignalTouch()
			trackSignalPage('/pricing')
		}
		expect(requests).toHaveLength(1)
		expect(store.get('puzzled:signal.touch')).toBe(initialTouch)
		const req = requests[0]
		expect(req.url).toBe('https://signal.example.test/v1/analytics/events:batch')
		expect(req.init?.keepalive).toBe(true)
		expect(req.init?.credentials).toBe('omit')
		expect(req.init?.referrerPolicy).toBe('no-referrer')
		expect(req.init?.signal).toBeInstanceOf(AbortSignal)
		expect(Object.fromEntries(new Headers(req.init?.headers))).toEqual({
			'content-type': 'application/json',
			'x-sylphx-key': stream.apiKey,
		})
		expect(req.body.consent).toBe('granted')
		const event = req.body.events[0]
		expect(event.event_id).toBe(`${event.session_id}:page_view:1`)
		expect(event.event_name).toBe('page_view')
		const fields = Object.fromEntries(
			Object.entries(campaign).filter(([key]) => choice === 'granted' || key.startsWith('utm_')),
		)
		expect(event.properties).toEqual({ ...fields, utm_id: 'fixture_extra', path: '/pricing' })
		expect(snapshot().fields).toMatchObject(fields)
		if (choice === 'analytics_only') {
			expect(initialTouch).not.toMatch(/gclid|gbraid|wbraid|fbclid/)
			expect(snapshot().fields).not.toHaveProperty('fbc')
		}
		navigate('/private?token=never-forward')
		trackSignalPage(null)
		navigate('/pricing?next=private')
		trackSignalPage('/pricing')
		expect(requests).toHaveLength(2)
		const second = requests[1].body.events[0]
		expect(second.session_id).toBe(event.session_id)
		expect(second.event_id).toBe(`${event.session_id}:page_view:2`)
		expect([...store.values()].join(' ')).not.toContain(event.session_id)
	})
}

for (const gpc of [true, false]) {
	test(`Wave 1 suppresses all requests on ${gpc ? 'GPC' : 'stored refusal'}`, () => {
		const { store, requests } = signalBrowser()
		store.set(CONSENT_KEY, gpc ? 'granted' : 'denied')
		store.set('puzzled:signal.touch', 'previous touch')
		setConsentContext({ region: 'ROW', gpc, stream })
		trackSignalPage('/pricing')
		expect(requests).toHaveLength(0)
		expect(store.has('puzzled:signal.touch')).toBe(false)
		expect(snapshot()).toEqual({ consent: denied, fields: null, surface: undefined })
	})
}

test('Signal CSP and context admit only a publishable key at a configured HTTPS origin', () => {
	for (const url of ['http://origin.test', 'https://origin.test/path', 'https://origin.test?q=x']) {
		expect(
			signalStreamConfig({ SYLPHX_PUBLISHABLE_KEY: stream.apiKey, SYLPHX_API_URL: url }),
		).toBeUndefined()
	}
	expect(
		signalStreamConfig({ SYLPHX_PUBLISHABLE_KEY: 'secret_fixture', SYLPHX_API_URL: undefined }),
	).toBeUndefined()
	const config = signalStreamConfig({
		SYLPHX_PUBLISHABLE_KEY: stream.apiKey,
		SYLPHX_API_URL: stream.baseUrl,
	})
	expect(config).toEqual(stream)
	expect(buildCsp(undefined, { signalOrigin: config?.baseUrl })).toContain(
		"connect-src 'self' https://signal.example.test;",
	)
	expect(buildCsp(undefined)).not.toContain('signal.example.test')
})
