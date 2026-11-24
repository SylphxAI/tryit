/** @jsxImportSource solid-js */
import { createClient } from '@connectrpc/connect'
import { createSignal, onCleanup, onMount, Show } from 'solid-js'
import { BillingService } from '@/gen/connect/puzzled/v1/billing_pb'
import { getConnectTransport } from '@/lib/connect/transport'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { localizedPath } from '@/lib/seo/urls'

export function FinishPassLink(props: { locale: Locale }) {
	const t = createTranslator(props.locale)
	// Mounted after all three free finishes. The board, result and Share
	// never wait for billing. Unknown entitlement or closed sales means no offer.
	const [showOffer, setShowOffer] = createSignal(false)
	let disposed = false
	onCleanup(() => {
		disposed = true
	})
	onMount(async () => {
		try {
			const { entitled, salesOpen } = await createClient(
				BillingService,
				getConnectTransport(),
			).getSubscription({})
			if (!disposed) setShowOffer(salesOpen && !entitled)
		} catch {
			// The result remains usable without the offer.
		}
	})
	return (
		<Show when={showOffer()}>
			<div>
				<a class="result-plus-link" href={localizedPath(props.locale, '/pricing')}>
					{t('gameResult.keepPlayingPlus')}
				</a>
			</div>
		</Show>
	)
}
