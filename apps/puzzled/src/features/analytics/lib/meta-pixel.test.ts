import { afterEach, expect, test } from 'bun:test'
import { CONSENT_KEY, CONSENT_VERSION_KEY } from '@/lib/storage-keys'
import { CONSENT_VERSION, canUseMeta, setAccountUnder18, setConsentContext } from './consent'
import {
	createMetaPixel,
	deleteMetaCookies,
	META_PIXEL_SCRIPT,
	metaPixelId,
	type PixelDocument,
	type PixelWindow,
	setActiveMetaPixel,
	trackMetaPurchase,
} from './meta-pixel'

const globals = globalThis as unknown as Record<string, unknown>
const navigatorGpc = Object.getOwnPropertyDescriptor(navigator, 'globalPrivacyControl')
const RECEIPT = { orderId: 'pi_3Fixture_Order-1', value: 4.99, currency: 'USD' }

function page(
	choice: string | null,
	region: 'EEA' | 'ROW',
	gpc = false,
	version: string | null = CONSENT_VERSION,
) {
	const store = new Map<string, string>()
	if (choice) store.set(CONSENT_KEY, choice)
	if (choice && version !== null) store.set(CONSENT_VERSION_KEY, version)
	globals.window = {
		localStorage: {
			getItem: (k: string) => store.get(k) ?? null,
			setItem: store.set.bind(store),
			removeItem: store.delete.bind(store),
		},
		addEventListener: () => {},
		removeEventListener: () => {},
		dispatchEvent: () => {},
	}
	setConsentContext({ region, gpc })
	const scripts: string[] = []
	const cookies: string[] = []
	const calls: unknown[][] = []
	const win: PixelWindow = { location: { hostname: 'www.tryit.fun' } }
	const doc: PixelDocument = {
		get cookie() {
			return ''
		},
		set cookie(value: string) {
			cookies.push(value)
		},
		createElement: () => ({ async: false, src: '' }),
		head: {
			appendChild: (node) => {
				scripts.push((node as { src: string }).src)
				// What fbevents.js does once loaded: drain the queue, then call through.
				const fbq = win.fbq
				if (fbq) {
					calls.push(...(fbq.queue ?? []))
					fbq.callMethod = (...args) => calls.push(args)
				}
			},
		},
	}
	const pixel = createMetaPixel({ id: '1234567890', win, doc })
	return { pixel, scripts, calls, cookies, win, store }
}

afterEach(() => {
	setAccountUnder18(false)
	if (navigatorGpc) Object.defineProperty(navigator, 'globalPrivacyControl', navigatorGpc)
	else Reflect.deleteProperty(navigator, 'globalPrivacyControl')
	setConsentContext(null)
	setActiveMetaPixel(null)
	globals.window = undefined
})

test('META_PIXEL_ID is optional: empty or malformed means off', () => {
	expect(metaPixelId({})).toBeNull()
	expect(metaPixelId({ META_PIXEL_ID: '' })).toBeNull()
	expect(metaPixelId({ META_PIXEL_ID: 'fb-123' })).toBeNull()
	expect(metaPixelId({ META_PIXEL_ID: ' 1234567890 ' })).toBe('1234567890')
})

type Case = [string, string | null, 'EEA' | 'ROW', boolean, (string | null)?]
// [name, saved choice, region bucket, Sec-GPC, saved consent version]
const refused: Case[] = [
	['ROW + Sec-GPC', null, 'ROW', true],
	['ROW + GPC over a saved grant', 'granted', 'ROW', true],
	['ROW saved opt-out', 'denied', 'ROW', false],
	['ROW saved analytics-only', 'analytics_only', 'ROW', false],
	['EEA unset', null, 'EEA', false],
	['EEA saved opt-out', 'denied', 'EEA', false],
	['EEA analytics-only', 'analytics_only', 'EEA', false],
	['EEA grant with no version (pre-2026-11-27)', 'granted', 'EEA', false, null],
	['EEA grant saved under 2026-11-26', 'granted', 'EEA', false, '2026-11-26'],
	['EEA grant with a garbage version', 'granted', 'EEA', false, 'garbage'],
	['EEA + GPC over a current grant', 'granted', 'EEA', true],
]
for (const [name, choice, region, gpc, version] of refused) {
	test(`${name}: zero pixel script, zero Meta calls`, () => {
		const { pixel, scripts, calls, win } = page(choice, region, gpc, version)
		setActiveMetaPixel(pixel)
		expect(canUseMeta()).toBe(false)
		expect(pixel.pageView('/')).toBe(false)
		expect(trackMetaPurchase(RECEIPT)).toBe(false)
		expect(scripts).toEqual([])
		expect(calls).toEqual([])
		expect(win.fbq).toBeUndefined()
	})
}

const allowed: Case[] = [
	['ROW default (no saved choice)', null, 'ROW', false],
	['ROW grant saved before the Meta version', 'granted', 'ROW', false, null],
	['EEA grant saved at 2026-11-27', 'granted', 'EEA', false],
]
for (const [name, choice, region, gpc, version] of allowed) {
	test(`${name}: Meta eligible`, () => {
		const { pixel, scripts } = page(choice, region, gpc, version)
		expect(canUseMeta()).toBe(true)
		expect(pixel.pageView('/')).toBe(true)
		expect(scripts).toEqual([META_PIXEL_SCRIPT])
	})
}

test('navigator.globalPrivacyControl alone keeps ROW Meta off', () => {
	Object.defineProperty(navigator, 'globalPrivacyControl', { value: true, configurable: true })
	const { pixel, scripts } = page(null, 'ROW')
	expect(canUseMeta()).toBe(false)
	expect(pixel.pageView('/')).toBe(false)
	expect(scripts).toEqual([])
})

test('the minor flag blocks Meta in every region, even with a current grant', () => {
	for (const region of ['ROW', 'EEA'] as const) {
		const { pixel, scripts, calls } = page('granted', region)
		setActiveMetaPixel(pixel)
		setAccountUnder18(true)
		expect(canUseMeta()).toBe(false)
		expect(pixel.pageView('/')).toBe(false)
		expect(trackMetaPurchase(RECEIPT)).toBe(false)
		expect(scripts).toEqual([])
		expect(calls).toEqual([])
		setAccountUnder18(false)
		expect(canUseMeta()).toBe(true)
	}
})

test('a saved full grant loads once and sends PageView without any user data', () => {
	const { pixel, scripts, calls } = page('granted', 'EEA')
	expect(pixel.pageView('/')).toBe(true)
	expect(pixel.pageView('/')).toBe(false)
	expect(pixel.pageView('/games')).toBe(true)
	expect(scripts).toEqual([META_PIXEL_SCRIPT])
	expect(calls).toEqual([
		['set', 'autoConfig', false, '1234567890'],
		['init', '1234567890'],
		['consent', 'grant'],
		['track', 'PageView'],
		['track', 'PageView'],
	])
	expect(pixel.pageView(null)).toBe(false)
})

test('Purchase eventID equals the Money order id, once per order', () => {
	const { pixel, calls } = page('granted', 'ROW')
	setActiveMetaPixel(pixel)
	expect(trackMetaPurchase(RECEIPT)).toBe(true)
	expect(trackMetaPurchase(RECEIPT)).toBe(false)
	expect(calls.at(-1)).toEqual([
		'track',
		'Purchase',
		{ value: 4.99, currency: 'USD' },
		{ eventID: RECEIPT.orderId },
	])
	expect(calls.filter((call) => call[1] === 'Purchase')).toHaveLength(1)
	for (const bad of [
		{ ...RECEIPT, orderId: 'user@example.test' },
		{ ...RECEIPT, value: 0 },
		{ ...RECEIPT, currency: 'usd' },
	]) {
		expect(trackMetaPurchase(bad)).toBe(false)
	}
})

test('interim dedup guard: payment ids (pi_) fire Purchase; invoice-only ids (in_) are left to CAPI', () => {
	const { pixel, calls } = page('granted', 'ROW')
	setActiveMetaPixel(pixel)
	expect(trackMetaPurchase({ ...RECEIPT, orderId: 'in_1Fixture_Invoice' })).toBe(false)
	expect(calls.some((call) => call[1] === 'Purchase')).toBe(false)
	expect(trackMetaPurchase({ ...RECEIPT, orderId: 'pi_1Fixture_Payment' })).toBe(true)
	expect(calls.filter((call) => call[1] === 'Purchase')).toEqual([
		['track', 'Purchase', { value: 4.99, currency: 'USD' }, { eventID: 'pi_1Fixture_Payment' }],
	])
})

test('withdrawal revokes, stops events and clears Meta cookies', () => {
	const { pixel, calls, cookies, store } = page('granted', 'ROW')
	expect(pixel.pageView('/')).toBe(true)
	store.set(CONSENT_KEY, 'denied')
	expect(pixel.pageView('/games')).toBe(false)
	expect(calls.at(-1)).toEqual(['consent', 'revoke'])
	expect(cookies).toContain('_fbp=; Max-Age=0; path=/; domain=.tryit.fun')
	expect(cookies).toContain('_fbc=; Max-Age=0; path=/')
})

test('cookie clearing covers the host and each parent domain', () => {
	const cookies: string[] = []
	deleteMetaCookies(
		{
			get cookie() {
				return ''
			},
			set cookie(value: string) {
				cookies.push(value)
			},
		},
		'a.tryit.fun',
	)
	expect(cookies).toContain('_fbp=; Max-Age=0; path=/; domain=.a.tryit.fun')
	expect(cookies).toContain('_fbp=; Max-Age=0; path=/; domain=.tryit.fun')
	expect(cookies).not.toContain('_fbp=; Max-Age=0; path=/; domain=.fun')
})
