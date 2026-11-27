import { afterEach, expect, test } from 'bun:test'
import { CONSENT_KEY } from '@/lib/storage-keys'
import { setConsentContext } from './consent'
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
const RECEIPT = { orderId: 'pi_3Fixture_Order-1', value: 4.99, currency: 'USD' }

function page(choice: string | null, region: 'EEA' | 'ROW', gpc = false) {
	const store = new Map<string, string>()
	if (choice) store.set(CONSENT_KEY, choice)
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

const refused: [string, string | null, 'EEA' | 'ROW', boolean][] = [
	['unset (EEA)', null, 'EEA', false],
	['unset (ROW default grant is not a saved choice)', null, 'ROW', false],
	['refused', 'denied', 'ROW', false],
	['analytics-only', 'analytics_only', 'ROW', false],
	['GPC over a saved grant', 'granted', 'ROW', true],
	['GPC over a saved grant (EEA)', 'granted', 'EEA', true],
]
for (const [name, choice, region, gpc] of refused) {
	test(`${name}: zero pixel script, zero Meta calls`, () => {
		const { pixel, scripts, calls, win } = page(choice, region, gpc)
		setActiveMetaPixel(pixel)
		expect(pixel.pageView('/')).toBe(false)
		expect(trackMetaPurchase(RECEIPT)).toBe(false)
		expect(scripts).toEqual([])
		expect(calls).toEqual([])
		expect(win.fbq).toBeUndefined()
	})
}

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
