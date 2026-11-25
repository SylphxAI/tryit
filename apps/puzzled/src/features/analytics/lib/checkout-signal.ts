import {
	type AttributionBindingRequest,
	parseAttributionCookies,
	type SignalAttribution,
} from '@sylphx/sdk/signal'
import { checkoutEntrySurface } from './checkout-entry-surface'
import { captureSignalTouch, cookieConsent } from './consent'

let measurementId: string | undefined

export function setCheckoutMeasurementId(value: string | null) {
	measurementId = value ?? undefined
}

type CheckoutSnapshot = Omit<
	AttributionBindingRequest,
	'checkout_session_id' | 'processor_session_id' | 'subscription_id' | 'page_location' | 'consent'
> &
	Omit<SignalAttribution, 'capturedAt'>

/** Use the SDK's consent, touch and checkout binding fields at the browser/RPC
 * boundary. Only Rust has the authoritative checkout session ID and binds to
 * Events; using bindCheckoutAttribution in the browser would create a second
 * writer and skip denials and checkout flows without a browser callback. */
export function checkoutSignalHeaders(trigger?: string): Record<string, string> {
	const { signals } = cookieConsent()
	const headers: Record<string, string> = {
		'x-puzzled-signal-consent': [
			signals.analytics_storage,
			signals.ad_storage,
			signals.ad_user_data,
			signals.ad_personalization,
		].join(','),
	}
	if (signals.analytics_storage === 'denied') return headers
	try {
		const surface = checkoutEntrySurface(trigger)
		if (surface) headers['x-puzzled-entry-surface'] = surface
		const ad = signals.ad_storage === 'granted' && signals.ad_user_data === 'granted'
		const { gaClientId, gaSessionId, fbc, fbp } = parseAttributionCookies(
			document.cookie,
			measurementId,
			{ analytics: true, ads: ad },
		)
		const { gclid, gbraid, wbraid, fbclid, capturedAt, ...utm } = captureSignalTouch()
		const metaClick =
			fbclid && capturedAt && !fbc?.endsWith(`.${fbclid}`) ? `fb.1.${capturedAt}.${fbclid}` : fbc
		const snapshot: CheckoutSnapshot = {
			ga_client_id: gaClientId,
			ga_session_id: gaSessionId,
			...utm,
			...(ad ? { gclid, gbraid, wbraid, fbclid, fbc: metaClick, fbp } : {}),
		}
		const json = JSON.stringify(snapshot)
		// ASCII-safe wire encoding, including international campaign tags.
		const binary = Array.from(new TextEncoder().encode(json), (byte) =>
			String.fromCharCode(byte),
		).join('')
		const encoded = btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
		if (encoded.length <= 6144) headers['x-puzzled-signal-attribution'] = encoded
	} catch {
		// Measurement can never block payment.
	}
	return headers
}
