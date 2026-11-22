/** @jsxImportSource solid-js */
import { ExternalLink } from 'lucide-solid'
import { createSignal, Show } from 'solid-js'
import { hasAnalyticsConsent } from '@/features/analytics/lib/consent'
import { trackGa4KeyEvent } from '@/features/analytics/lib/ga4-key-events'
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
						type="checkbox"
						class="mt-0.5 h-5 w-5 shrink-0 accent-primary"
						checked={consent()}
						onChange={(event) => setConsent(event.currentTarget.checked)}
					/>
					<span>{t('immediateSupplyConsent')}</span>
				</label>
			) : null}
			{props.locale === 'ja' && (
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
			{props.renewalNote ? (
				<p
					class={
						props.compact
							? 'mb-2 text-xs leading-snug text-muted-foreground'
							: 'mb-2.5 text-sm text-muted-foreground'
					}
				>
					{props.renewalNote}
					{!requiresWaiver ? ` ${t('recurringSupplyTerms')}` : ''}
				</p>
			) : !requiresWaiver ? (
				<p
					class={
						props.compact
							? 'mb-2 text-xs leading-snug text-muted-foreground'
							: 'mb-2.5 text-sm text-muted-foreground'
					}
				>
					{t('recurringSupplyTerms')}
				</p>
			) : null}
			<button
				type="button"
				data-checkout-trigger={checkoutTrigger()}
				class={buttonClass}
				disabled={busy() || (requiresWaiver && !consent())}
				onClick={async () => {
					if (busy() || (requiresWaiver && !consent())) return
					setBusy(true)
					setError(null)
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
						const consentAtStart = hasAnalyticsConsent()
						const url = await startCheckout(
							plan,
							props.locale,
							props.currency,
							requiresWaiver ? consent() : false,
							props.callbackUrl,
						)
						if (consentAtStart && hasAnalyticsConsent()) {
							trackGa4KeyEvent('begin_checkout', {
								plan: planTier,
								plan_sku: plan,
								billing_interval: billingInterval,
								checkout_trigger: trigger,
								option,
								value,
								currency,
							})
							// What the checkout return reports to Google Ads (kept only with consent).
							rememberCheckoutQuote({ plan, value, currency })
						}
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
				<ExternalLink class="h-4 w-4" aria-hidden="true" />
			</button>
			<Show when={error()}>
				<p role="alert" class="mt-2 text-sm text-destructive">
					{error()}
				</p>
			</Show>
		</div>
	)
}
