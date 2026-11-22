/** @jsxImportSource solid-js */
import { createClient } from '@connectrpc/connect'
import { createSignal, onCleanup, onMount, Show } from 'solid-js'
import { ARCHIVE_WINDOW_DAYS } from '@/features/daily/lib/archive-days'
import { getGameSlugs } from '@/games/registry'
import { BillingService } from '@/gen/connect/puzzled/v1/billing_pb'
import { getConnectTransport } from '@/lib/connect/transport'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { localizedPath } from '@/lib/seo/urls'

export function FinishPassLink(props: { locale: Locale }) {
	const t = createTranslator(props.locale)
	// Mounted only after a fresh featured finish. The board, result and Share
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
				<a
					class="inline-flex min-h-12 items-center text-sm font-semibold underline underline-offset-4"
					href={localizedPath(props.locale, '/pricing')}
				>
					{t('gameResult.finishPassLink', {
						games: getGameSlugs().length,
						days: ARCHIVE_WINDOW_DAYS,
					})}
				</a>
			</div>
		</Show>
	)
}
