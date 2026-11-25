import { create } from '@bufbuild/protobuf'
import { type PushTrigger, trackBehavioralEvent } from '@/features/analytics/lib/behavioral-events'
import {
	GetWebPushConfigRequestSchema,
	SaveWebPushSubscriptionRequestSchema,
} from '@/gen/connect/puzzled/v1/preferences_pb'
import { createPreferencesServiceClient } from '@/lib/connect/preferences-client'

export function decodePublicKey(value: string): Uint8Array<ArrayBuffer> {
	const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/'))
	return Uint8Array.from(raw, (char) => char.charCodeAt(0))
}

/** Register before waiting for ready: an unregistered worker would wait forever. */
export async function pushRegistration(): Promise<ServiceWorkerRegistration> {
	await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
	return navigator.serviceWorker.ready
}

export async function persistSubscription(sub: PushSubscription, remove = false): Promise<void> {
	const json = sub.toJSON()
	await createPreferencesServiceClient().saveWebPushSubscription(
		create(SaveWebPushSubscriptionRequestSchema, {
			endpoint: sub.endpoint,
			p256dh: json.keys?.p256dh ?? '',
			auth: json.keys?.auth ?? '',
			remove,
			locale: document.documentElement.lang || 'en-US',
		}),
	)
}

export async function subscribeBrowser(
	trigger: PushTrigger = 'settings',
): Promise<PushSubscription | null> {
	// Ask within the user's tap, never on first paint.
	const willPrompt = Notification.permission === 'default'
	const permission = await Notification.requestPermission()
	if (willPrompt)
		trackBehavioralEvent({
			event: 'push_opted_in',
			trigger,
			result: permission === 'default' ? 'dismissed' : permission,
		})
	if (permission !== 'granted') return null
	const client = createPreferencesServiceClient()
	const { publicKey } = await client.getWebPushConfig(create(GetWebPushConfigRequestSchema, {}))
	if (!publicKey) throw new Error('push_unconfigured')
	const registration = await pushRegistration()
	const sub =
		(await registration.pushManager.getSubscription()) ??
		(await registration.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: decodePublicKey(publicKey),
		}))
	await persistSubscription(sub)
	return sub
}
