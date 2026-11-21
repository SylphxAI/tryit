/** @jsxImportSource solid-js */
import { Show } from 'solid-js'
import type { PlanId } from '@/lib/billing/plus'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { safeCallbackPath } from '@/lib/identity/after-sign-up'
import { localizedPath } from '@/lib/seo/urls'
import type { CheckoutOfferData } from './checkout-offer-data'
import { CurrencySwitcher } from './currency-switcher'
import { PlusOffer } from './plus-offer'

type Props = {
	data: CheckoutOfferData
	locale: Locale
	signedIn: boolean
	callbackUrl: string
	gameCount: number
	checkoutTrigger: string
	compact?: boolean
}

export function CheckoutOffer(props: Props) {
	const t = createTranslator(props.locale)
	const card = (id: PlanId) => props.data.cards.find((card) => card.id === id)
	const returnTo = () => safeCallbackPath(props.callbackUrl) ?? '/archive'
	const comparePlans = () => (
		<a
			href={localizedPath(
				props.locale,
				'/pricing?' +
					new URLSearchParams({ callbackUrl: returnTo(), trigger: props.checkoutTrigger }),
			)}
			class="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4 hover:text-foreground"
		>
			{t('plus.checkoutOffer.comparePlans')}
		</a>
	)
	return (
		<Show
			when={props.data.cards.length > 0}
			fallback={
				<div class="rounded-2xl border border-border bg-card p-5">
					<p class="font-semibold">{t('plus.checkoutOffer.unavailableTitle')}</p>
					<p class="mt-2 text-sm text-muted-foreground">
						{t('plus.checkoutOffer.unavailableBody')}
					</p>
					{comparePlans()}
				</div>
			}
		>
			<PlusOffer
				id="plus"
				title={t('plus.name')}
				subtitle={t('plus.checkoutOffer.body', { count: props.gameCount })}
				accentDot
				emphasized
				radioName="unlock-plan"
				once={card('individual_once')}
				yearly={card('individual_yearly')}
				monthly={card('individual_monthly')}
				initialPlan={card('individual_once')?.id}
				locale={props.locale}
				signedIn={props.signedIn}
				subscribed={false}
				callbackUrl={returnTo()}
				checkoutTrigger={props.checkoutTrigger}
				compact={props.compact}
				headerSlot={
					<CurrencySwitcher
						locale={props.locale}
						currencies={props.data.currencies}
						current={props.data.currency}
						compact={props.compact}
					/>
				}
				footerSlot={comparePlans()}
			/>
		</Show>
	)
}
