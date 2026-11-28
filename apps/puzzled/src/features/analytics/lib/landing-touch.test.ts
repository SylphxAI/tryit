import { afterEach, expect, test } from 'bun:test'
import { CONSENT_KEY } from '@/lib/storage-keys'
import { GET } from '@/routes/api/consent-context'
import { checkoutSignalHeaders } from './checkout-signal'
import { captureSignalTouch, rememberLanding, saveCookieChoice, setConsentContext } from './consent'

const globals = globalThis as unknown as Record<string, unknown>
const LANDING = 'https://tryit.fun/?gclid=x&utm_source=y'

/** A browser that landed on LANDING and then moved within the SPA. */
function landThenNavigate(saved?: string) {
	const store = new Map<string, string>()
	if (saved) store.set(CONSENT_KEY, saved)
	const location = { href: LANDING }
	const history = {
		state: { _depth: 1 },
		replaceState(_state: unknown, _unused: string, url: string) {
			location.href = new URL(url, location.href).href
		},
	}
	globals.window = {
		location,
		history,
		localStorage: {
			getItem: (k: string) => store.get(k) ?? null,
			setItem: store.set.bind(store),
			removeItem: store.delete.bind(store),
		},
		addEventListener: () => {},
		removeEventListener: () => {},
		dispatchEvent: () => {},
	}
	globals.document = { cookie: '' }
	// ConsentRuntime remembers the landing at mount, before consent-context resolves.
	rememberLanding(location.href)
	location.href = 'https://tryit.fun/pricing'
	return { store, location }
}

async function resolve(country?: string, gpc?: string) {
	const headers = new Headers()
	if (country) headers.set('CF-IPCountry', country)
	if (gpc) headers.set('Sec-GPC', gpc)
	const response = GET({
		request: new Request('https://tryit.fun/api/consent-context', { headers }),
	})
	setConsentContext(await response.json())
}

function fields(): Record<string, unknown> | null {
	const encoded = checkoutSignalHeaders()['x-puzzled-signal-attribution']
	return encoded ? JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) : null
}

function persisted(store: Map<string, string>): string {
	return [...store.entries()].map(([k, v]) => `${k}=${v}`).join('\n')
}

afterEach(() => {
	setConsentContext(null)
	globals.window = undefined
	globals.document = undefined
})

test('ROW granted after an SPA navigation still binds the landing gclid and utm', async () => {
	const { store, location } = landThenNavigate()
	await resolve('US')
	expect(fields()).toMatchObject({ gclid: 'x', utm_source: 'y' })
	// The address is restored to where the visitor is now.
	expect(location.href).toBe('https://tryit.fun/pricing')
	expect(persisted(store)).toContain('"gclid":"x"')
})

test('analytics-only keeps the landing UTM but no click id', async () => {
	const { store } = landThenNavigate('analytics_only')
	await resolve('DE')
	const snapshot = fields()
	expect(snapshot).toMatchObject({ utm_source: 'y' })
	expect(snapshot?.gclid).toBeUndefined()
	expect(persisted(store)).not.toContain('gclid')
})

for (const [name, saved, country, gpc] of [
	['refusal', 'denied', 'US', undefined],
	['GPC', undefined, 'US', '1'],
	['EEA before a choice', undefined, 'DE', undefined],
	['unknown region before a choice', undefined, undefined, undefined],
] as const) {
	test(`${name}: no landing touch is captured or persisted`, async () => {
		const { store } = landThenNavigate(saved)
		await resolve(country, gpc)
		expect(captureSignalTouch()).toEqual({})
		expect(fields()).toBeNull()
		expect(persisted(store)).not.toMatch(/gclid|utm_source/)
	})
}

test('a refusal before a later grant discards the remembered landing', async () => {
	const { store } = landThenNavigate()
	await resolve('DE')
	saveCookieChoice('denied')
	saveCookieChoice('granted')
	expect(fields()?.gclid).toBeUndefined()
	expect(persisted(store)).not.toContain('gclid')
})
