/**
 * Meta Pixel, off unless META_PIXEL_ID is set. It loads only when canUseMeta()
 * allows it (ROW default unless refused; EEA/UK/CH/unknown only after a saved
 * current-version grant; never under GPC or for a flagged minor): before that
 * there is no script and no request. Init carries no advanced matching, so no email,
 * player, auth or customer id reaches Meta. Purchase uses the Money order id
 * as eventID so Events' Conversions API delivery of the same order deduplicates.
 */
import { canUseMeta } from './consent'

const PIXEL_ID = /^\d{6,20}$/
const ORDER_ID = /^[A-Za-z0-9_-]{1,128}$/
export const META_PIXEL_SCRIPT = 'https://connect.facebook.net/en_US/fbevents.js'

export function metaPixelId(source: { META_PIXEL_ID?: string }): string | null {
	const id = source.META_PIXEL_ID?.trim() ?? ''
	return PIXEL_ID.test(id) ? id : null
}

/** The single Meta gate; see canUseMeta in consent.ts. */
export const metaPixelAllowed = canUseMeta

type Fbq = ((...args: unknown[]) => void) & {
	callMethod?: (...args: unknown[]) => void
	queue?: unknown[][]
	push?: unknown
	loaded?: boolean
	version?: string
}
export type PixelWindow = { fbq?: Fbq; _fbq?: Fbq; location: { hostname: string } }
export type PixelDocument = {
	cookie: string
	createElement(tag: 'script'): { async: boolean; src: string }
	head: { appendChild(node: unknown): unknown }
}
export type MetaPurchase = { orderId: string; value: number; currency: string }

export function deleteMetaCookies(doc: Pick<PixelDocument, 'cookie'>, hostname: string) {
	const labels = hostname.split('.')
	const domains = [
		'',
		...labels.slice(0, -1).map((_, i) => `; domain=.${labels.slice(i).join('.')}`),
	]
	for (const name of ['_fbp', '_fbc']) {
		for (const domain of domains) {
			doc.cookie = `${name}=; Max-Age=0; path=/${domain}`
		}
	}
}

export function createMetaPixel({
	id,
	win,
	doc,
	allowed = metaPixelAllowed,
}: {
	id: string
	win: PixelWindow
	doc: PixelDocument
	allowed?: () => boolean
}) {
	let loaded = false
	let granted = false
	let lastPath: string | null = null
	const purchased = new Set<string>()
	const fbq = (...args: unknown[]) => win.fbq?.(...args)

	function load() {
		const queue: unknown[][] = []
		const stub: Fbq = (...args) => {
			if (stub.callMethod) stub.callMethod(...args)
			else queue.push(args)
		}
		Object.assign(stub, { queue, push: stub, loaded: true, version: '2.0' })
		win.fbq = stub
		win._fbq ??= stub
		fbq('set', 'autoConfig', false, id)
		fbq('init', id)
		const script = doc.createElement('script')
		script.async = true
		script.src = META_PIXEL_SCRIPT
		doc.head.appendChild(script)
		loaded = true
	}

	/** Load or resume on a grant; revoke and clear Meta cookies on withdrawal. */
	function sync(): boolean {
		if (allowed()) {
			if (!loaded) load()
			if (!granted) fbq('consent', 'grant')
			granted = true
			return true
		}
		if (granted) fbq('consent', 'revoke')
		granted = false
		lastPath = null
		deleteMetaCookies(doc, win.location.hostname)
		return false
	}

	return {
		sync,
		/** One PageView per public path change; private pages pass null. */
		pageView(path: string | null): boolean {
			if (!path || path === lastPath || !sync()) return false
			lastPath = path
			fbq('track', 'PageView')
			return true
		},
		/**
		 * The api's Money-settled receipt only; eventID is the order id. Interim:
		 * only payment ids (`pi_`). A subscription receipt can be an invoice id
		 * (`in_`) while Events sends the payment id, which would not dedupe, so
		 * Events' Conversions API carries those alone.
		 */
		purchase({ orderId, value, currency }: MetaPurchase): boolean {
			if (
				!orderId.startsWith('pi_') ||
				!ORDER_ID.test(orderId) ||
				!Number.isFinite(value) ||
				value <= 0
			)
				return false
			if (!/^[A-Z]{3}$/.test(currency) || purchased.has(orderId) || !sync()) return false
			purchased.add(orderId)
			fbq('track', 'Purchase', { value, currency }, { eventID: orderId })
			return true
		},
	}
}

export type MetaPixelController = ReturnType<typeof createMetaPixel>
let active: MetaPixelController | null = null

export function setActiveMetaPixel(pixel: MetaPixelController | null) {
	active = pixel
}

export function trackMetaPurchase(receipt: MetaPurchase): boolean {
	return active?.purchase(receipt) ?? false
}
