/** @jsxImportSource solid-js */
import { createClient } from '@connectrpc/connect'
import { createSignal, onCleanup, onMount, Show } from 'solid-js'
import { readPlayGuestStatus } from '@/features/daily/solid/play-analytics-context'
import type { PassOffer } from '@/features/plus-offer/lib/pass-offer'
import { BillingService } from '@/gen/connect/puzzled/v1/billing_pb'
import { getConnectTransport } from '@/lib/connect/transport'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { localizedPath } from '@/lib/seo/urls'
import { readPassOffer } from './read-pass-offer'

const passPath = '/pricing?plan=individual_once&trigger=result_card_picks_exhausted#plus'

export function FinishPassLink(props: { locale: Locale }) {
	const t = createTranslator(props.locale)
	// Mounted after all three free finishes. Neither read can hold up the result.
	const [offer, setOffer] = createSignal<PassOffer | 'account' | null>(null)
	let disposed = false
	onCleanup(() => {
		disposed = true
	})
	onMount(async () => {
		try {
			const guest = await readPlayGuestStatus()
			if (disposed) return
			if (guest === true) {
				// A guest hint alone proves no entitlement fact. Require the existing
				// request-local credential/claim suppressors and a readable Pass price.
				const pass = await readPassOffer(props.locale)
				if (!disposed) setOffer(pass)
				return
			}
			if (guest !== false) return
			const { entitled, salesOpen } = await createClient(
				BillingService,
				getConnectTransport(),
			).getSubscription({})
			if (!disposed && salesOpen && !entitled) setOffer('account')
		} catch {
			// The result remains usable without the offer.
		}
	})
	const label = (choice: PassOffer | 'account') =>
		choice === 'account'
			? t('gameResult.keepPlayingPlus')
			: t('plus.passOffer.cta', { days: choice.days })
	return (
		<Show when={offer()}>
			{(current) => (
				<div>
					<a
						class="result-plus-link"
						href={localizedPath(props.locale, current() === 'account' ? '/pricing' : passPath)}
					>
						{label(current())}
					</a>
				</div>
			)}
		</Show>
	)
}
