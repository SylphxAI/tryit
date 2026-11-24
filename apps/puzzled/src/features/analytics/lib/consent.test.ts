import { afterEach, expect, test } from 'bun:test'
import { resolveEffectiveConsent } from '@sylphx/sdk/signal'
import { CONSENT_KEY } from '@/lib/storage-keys'
import { GET } from '@/routes/api/consent-context'
import { checkoutSignalHeaders, setCheckoutMeasurementId } from './checkout-signal'
import { cookieConsent, saveCookieChoice, setConsentContext } from './consent'

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
	const headers = checkoutSignalHeaders('pricing_card')
	const encoded = headers['x-puzzled-signal-attribution']
	return {
		consent: headers['x-puzzled-signal-consent'],
		fields: encoded ? JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) : null,
		surface: headers['x-puzzled-entry-surface'],
	}
}

afterEach(() => {
	setConsentContext(null)
	globals.window = undefined
	globals.document = undefined
	if (navigatorGpc) Object.defineProperty(navigator, 'globalPrivacyControl', navigatorGpc)
	else Reflect.deleteProperty(navigator, 'globalPrivacyControl')
})

for (const country of ['US', 'CA', 'AU']) {
	test(`${country} defaults to complete SDK consent and attribution`, async () => {
		browser()
		await context(country)
		expect(snapshot()).toEqual({
			consent: full,
			surface: 'pricing_card',
			fields: {
				ga_client_id: '12345.67890',
				ga_session_id: '1234567890',
				gclid: 'fixture_g',
				fbclid: 'fixture_fb',
				fbp: 'fb.1.1234567890.444',
				fbc: expect.stringMatching(/^fb\.1\.\d+\.fixture_fb$/),
				utm_source: 'fixture',
			},
		})
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
