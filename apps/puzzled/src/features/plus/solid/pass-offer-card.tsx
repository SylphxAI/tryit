/** @jsxImportSource solid-js */
import { createSignal, onCleanup, onMount, Show } from 'solid-js'
import {
	markPassOfferSeen,
	PASS_OFFER_TRIGGER,
	type PassOffer,
	type PassOfferContext,
	passOfferExitKey,
	passOfferSeen,
} from '@/features/plus-offer/lib/pass-offer'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { localizedPath } from '@/lib/seo/urls'
import { readPassOffer } from './read-pass-offer'

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
	let disposed = false
	onCleanup(() => {
		disposed = true
	})
	onMount(async () => {
		if (!props.dayKey || passOfferSeen(store(), props.context, props.dayKey)) return
		try {
			const next = await readPassOffer(props.locale)
			if (disposed || !next) return
			markPassOfferSeen(store(), props.context, props.dayKey)
			setOffer(next)
		} catch {
			// No safe offer projection or live price: keep the free result usable.
		}
	})
	const pricingHref = () => {
		const query = new URLSearchParams({
			plan: 'individual_once',
			trigger: PASS_OFFER_TRIGGER[props.context],
		})
		if (props.callbackUrl) query.set('callbackUrl', props.callbackUrl)
		return localizedPath(props.locale, `/pricing?${query}#plus`)
	}
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
					<div class="flex flex-wrap gap-2">
						<a class={choice} href={pricingHref()}>
							{t('cta', { days: pass().days })}
						</a>
						<button
							type="button"
							class={choice}
							data-pass-offer-exit
							onClick={() => setOffer(null)}
						>
							{t(passOfferExitKey(props.context))}
						</button>
					</div>
				</section>
			)}
		</Show>
	)
}
