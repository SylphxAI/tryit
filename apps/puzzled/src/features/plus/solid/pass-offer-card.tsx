/** @jsxImportSource solid-js */
import { createClient } from '@connectrpc/connect'
import { createSignal, onCleanup, onMount, Show } from 'solid-js'
import { readUnlockPrices } from '@/features/daily/solid/unlock-prices'
import {
	markPassOfferSeen,
	PASS_OFFER_TRIGGER,
	type PassOffer,
	type PassOfferContext,
	passOfferExitKey,
	passOfferFor,
	passOfferSeen,
} from '@/features/plus-offer/lib/pass-offer'
import { BillingService } from '@/gen/connect/puzzled/v1/billing_pb'
import { getConnectTransport } from '@/lib/connect/transport'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { SubscribeButton } from './subscribe-button'

const choice =
	'chrome-control min-h-12 flex-1 justify-center rounded-xl border border-border px-4 font-semibold'

function store() {
	try {
		return window.localStorage
	} catch {
		return null
	}
}

/**
 * A quiet, dismissible 3-day pass offer. Mounted after the result or the lock
 * is already usable; it never blocks Share, Next or the free path. The price
 * is Money's catalogue amount in the visitor's currency; any failed read hides it.
 */
export function PassOfferCard(props: {
	locale: Locale
	context: PassOfferContext
	/** Server product day (`Asia/Hong_Kong`). */
	dayKey: string
	callbackUrl?: string
}) {
	const translate = createTranslator(props.locale)
	const t = (key: string, values?: Record<string, string | number>) =>
		translate(`plus.passOffer.${key}`, values)
	const [offer, setOffer] = createSignal<PassOffer | null>(null)
	const [open, setOpen] = createSignal(false)
	let disposed = false
	onCleanup(() => {
		disposed = true
	})
	onMount(async () => {
		if (!props.dayKey || passOfferSeen(store(), props.context, props.dayKey)) return
		try {
			const [access, prices] = await Promise.all([
				createClient(BillingService, getConnectTransport()).getSubscription({}),
				readUnlockPrices(props.locale),
			])
			const { salesOpen, entitled } = access
			const next = passOfferFor({ salesOpen, entitled }, prices.cards, props.locale)
			if (disposed || !next) return
			markPassOfferSeen(store(), props.context, props.dayKey)
			setOffer(next)
		} catch {
			// No membership answer or no live price: no offer.
		}
	})
	return (
		<Show when={offer()}>
			{(pass) => (
				<section
					data-pass-offer={props.context}
					class="mt-3 grid gap-2 rounded-xl border border-border p-3 text-sm"
					aria-label={t('title', { days: pass().days })}
				>
					<p class="font-semibold">{t('title', { days: pass().days })}</p>
					<p class="tnum text-muted-foreground">{t('price', { price: pass().price })}</p>
					<Show
						when={open()}
						fallback={
							<div class="flex flex-wrap gap-2">
								<button type="button" class={choice} onClick={() => setOpen(true)}>
									{t('cta', { days: pass().days })}
								</button>
								<button
									type="button"
									class={choice}
									data-pass-offer-exit
									onClick={() => setOffer(null)}
								>
									{t(passOfferExitKey(props.context))}
								</button>
							</div>
						}
					>
						<SubscribeButton
							planId={pass().planId}
							currency={pass().currency}
							amountMinor={pass().amountMinor}
							locale={props.locale}
							signedIn={false}
							subscribed={false}
							label={t('checkout', { price: pass().price })}
							callbackUrl={props.callbackUrl}
							checkoutTrigger={PASS_OFFER_TRIGGER[props.context]}
							compact
						/>
						<button
							type="button"
							class={choice}
							data-pass-offer-exit
							onClick={() => setOffer(null)}
						>
							{t(passOfferExitKey(props.context))}
						</button>
					</Show>
				</section>
			)}
		</Show>
	)
}
