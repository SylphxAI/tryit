/** @jsxImportSource solid-js */
import { ArrowRight, ExternalLink } from 'lucide-solid'
import { createSignal, createUniqueId, onMount, Show } from 'solid-js'
import { cookieConsent, hasAnalyticsConsent } from '@/features/analytics/lib/consent'
import { trackGa4KeyEvent } from '@/features/analytics/lib/ga4-key-events'
import { trackGa4PricingOffer } from '@/features/analytics/lib/ga4-pricing-offer'
import { rememberCheckoutQuote } from '@/features/analytics/lib/google-tag'
import { isOneTimePassPlan, minorUnitsToMajor, type PlanId } from '@/lib/billing/plus'
import { startCheckout } from '@/lib/connect/billing-client'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { logger } from '@/lib/logger'
import { localizedPath } from '@/lib/seo/urls'
import styles from './pricing.module.css'

type Props = {
	planId: string
	currency: string
	/** The plan's price in `currency`, minor units: what a trial converts to. */
	amountMinor: number
	locale: Locale
	signedIn: boolean
	subscribed: boolean
	label: string
	/** Safe in-product destination (e.g. a locked game) to return to after checkout. */
	callbackUrl?: string
	/** What the buyer is agreeing to renew at, shown between the consent tick and the button. */
	renewalNote?: string
	/** Surface trigger label for begin_checkout telemetry. */
	checkoutTrigger?: string
	/** Compact vertical rhythm for above-the-fold unlock panels (keeps Reg 36/37 intact). */
	compact?: boolean
	/** Separate statutory withdrawal from the price and renewal terms on pricing. */
	pricingPage?: boolean
}

/**
 * Starts checkout for one plan. One-off digital passes (3-Day Pass, UK CCR 2013
 * Reg 37) require an explicit 14-day cancellation waiver checkbox; recurring
 * subscriptions (UK CCR 2013 Reg 36) display compliant renewal and proportionate
 * cancellation terms without forcing a 14-day waiver.
 * Cold guests proceed straight into Stripe Checkout and claim their subscription after payment.
 */
export function SubscribeButton(props: Props) {
	const translate = createTranslator(props.locale)
	const t = (key: string) => translate(`plus.pricing.${key}`)
	const checkoutTrigger = () => props.checkoutTrigger ?? 'pricing_subscribe'
	const [busy, setBusy] = createSignal(false)
	const [error, setError] = createSignal<string | null>(null)
	const [consent, setConsent] = createSignal(false)
	const requiresWaiver = isOneTimePassPlan(props.planId as PlanId)
	const termsId = createUniqueId()
	let waiverInput: HTMLInputElement | undefined
	// The native checkbox is usable before hydration; its early change event
	// is not replayed. Seed client state from the actual choice, not from SSR.
	onMount(() => setConsent(waiverInput?.checked === true))
	const buttonClass = `${styles.checkout} pressable inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60`

	if (props.signedIn && props.subscribed) {
		return (
			<a href={localizedPath(props.locale, '/settings/subscription')} class={buttonClass}>
				{t('currentPlan')}
			</a>
		)
	}

	return (
		<div>
			{requiresWaiver ? (
				<label
					class={
						props.compact
							? 'mb-2 flex min-h-11 cursor-pointer items-start gap-2.5 text-xs leading-snug'
							: 'mb-3 flex min-h-11 cursor-pointer items-start gap-3 text-sm'
					}
				>
					<input
						ref={waiverInput}
						type="checkbox"
						class="mt-0.5 h-5 w-5 shrink-0 accent-primary"
						onChange={(event) => setConsent(event.currentTarget.checked)}
					/>
					<span id={termsId}>{t('immediateSupplyConsent')}</span>
				</label>
			) : null}
			{props.locale === 'ja' && !props.pricingPage && (
				<a
					href={localizedPath(props.locale, '/tokushoho')}
					class={
						props.compact
							? 'mb-1.5 inline-flex min-h-11 items-center text-xs underline underline-offset-2'
							: 'mb-3 inline-flex min-h-11 items-center text-sm underline underline-offset-2'
					}
				>
					特定商取引法に基づく表記
				</a>
			)}
			{(props.renewalNote || (!requiresWaiver && !props.pricingPage)) && (
				<p
					class={
						props.compact
							? 'mb-2 text-xs leading-snug text-muted-foreground'
							: 'mb-2.5 text-sm leading-snug text-muted-foreground'
					}
				>
					{props.renewalNote}
					{!requiresWaiver && !props.pricingPage ? ` ${t('recurringSupplyTerms')}` : ''}
				</p>
			)}
			<button
				type="button"
				data-checkout-trigger={checkoutTrigger()}
				class={buttonClass}
				aria-describedby={requiresWaiver || props.pricingPage ? termsId : undefined}
				disabled={busy() || (requiresWaiver && !consent())}
				onClick={async (event) => {
					if (busy() || (requiresWaiver && !consent())) return
					setBusy(true)
					setError(null)
					if (props.pricingPage && event.isTrusted)
						trackGa4PricingOffer('upgrade_cta_click', props.planId)
					try {
						const billingInterval = props.planId.endsWith('_yearly')
							? 'year'
							: props.planId.endsWith('_monthly')
								? 'month'
								: 'once'
						const planTier = props.planId.startsWith('family_') ? 'family' : 'plus'
						const option = requiresWaiver ? 'pass' : 'subscription'
						const plan = props.planId
						const currency = props.currency.toUpperCase()
						const value = minorUnitsToMajor(props.amountMinor, currency)
						const trigger = checkoutTrigger()
						const consentAtStart = cookieConsent()
						const url = await startCheckout(
							plan,
							props.locale,
							props.currency,
							requiresWaiver ? consent() : false,
							props.callbackUrl,
							trigger,
						)
						if (consentAtStart.analytics && hasAnalyticsConsent()) {
							trackGa4KeyEvent('begin_checkout', {
								plan: planTier,
								plan_sku: plan,
								billing_interval: billingInterval,
								checkout_trigger: trigger,
								option,
								value,
								currency,
							})
						}
						// Snapshot only with consent at initiation; the quote helper rechecks it now.
						if (consentAtStart.analytics || consentAtStart.marketing)
							rememberCheckoutQuote({ plan, value, currency })
						window.location.assign(url)
					} catch (err) {
						logger.error('plus.checkout-failed', { planId: props.planId, error: err })
						const message = err instanceof Error ? err.message : ''
						setError(
							message.includes('already_subscribed')
								? t('alreadySubscribed')
								: message.includes('consent_required')
									? t('consentRequired')
									: message.includes('plan_not_on_sale')
										? t('purchasesSoon')
										: t('checkoutFailed'),
						)
						setBusy(false)
					}
				}}
			>
				{busy() ? t('subscribing') : props.label}
				{props.pricingPage ? (
					<ArrowRight class="h-4 w-4 shrink-0" aria-hidden="true" />
				) : (
					<ExternalLink class="h-4 w-4" aria-hidden="true" />
				)}
			</button>
			<Show when={error()}>
				<p role="alert" class="mt-2 text-sm text-destructive">
					{error()}
				</p>
			</Show>
			{props.pricingPage && !requiresWaiver ? (
				<p id={termsId} class="mt-2 text-xs leading-relaxed text-muted-foreground">
					{t('recurringSupplyTerms')}
				</p>
			) : null}
		</div>
	)
}
