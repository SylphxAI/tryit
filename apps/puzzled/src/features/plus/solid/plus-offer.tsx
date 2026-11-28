/** @jsxImportSource solid-js */
import { Check } from 'lucide-solid'
import { createEffect, createMemo, createSignal, For, type JSX, onMount, Show } from 'solid-js'
import { trackPlusViewStage } from '@/features/analytics/lib/signal-stages'
import { usePricingOfferVisibility } from '@/features/analytics/solid/pricing-offer-visit'
import { formatMonthlyEquivalentPrice, formatPrice, type PlanCard } from '@/lib/billing/plus'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { cn } from '@/lib/utils'
import { formatFamilyMonthlyPerPerson, pricingYearlySaving } from '../lib/pricing-display'
import styles from './pricing.module.css'
import { SubscribeButton } from './subscribe-button'
import { TrialChargeLine } from './trial-charge-line'

type Props = {
	/** HTML anchor id (`plus` or `family`). */
	id: 'plus' | 'family'
	/** Card heading (e.g. `Tryit Plus` or `Tryit Family`). */
	title: string
	/** Short subtitle under the card heading. */
	subtitle: string
	/** Accent square marker shown beside the primary Individual plan heading. */
	accentDot?: boolean
	/** Primary visual emphasis for the flagship Individual tier. */
	emphasized?: boolean
	/** Benefit lines for this tier. */
	features?: string[]
	/** Radio group name so Individual and Family selectors stay independent. */
	radioName: string
	/** Sign-in return anchor. */
	returnAnchor?: 'plus' | 'family'
	/** Available interval options for this tier in the chosen currency. */
	once?: PlanCard
	yearly: PlanCard | undefined
	/** Seat count for the per-person equivalent on the yearly Family offer. */
	familyMax?: number
	monthly: PlanCard | undefined
	locale: Locale
	signedIn: boolean
	subscribed: boolean
	/** null explicitly starts with no purchase selected. */
	initialPlan?: string | null
	onPlanChange?: (card: PlanCard) => void
	/** Safe post-checkout return destination (e.g. from GameUnlockPanel). */
	callbackUrl?: string
	/** Distinct surface trigger label attributed on GA4 `begin_checkout`. */
	checkoutTrigger?: string
	/** Compact spacing for locked-game unlock surfaces so checkout stays above the fold. */
	compact?: boolean
	/** Standalone pricing presents the benefits before plan selection. */
	pricingPage?: boolean
	/** Slot rendered at the top of the column above the card (e.g. currency switcher). */
	headerSlot?: JSX.Element
	/** Related navigation below the card. */
	afterCheckout?: JSX.Element
	/** Slot rendered below the card (e.g. compare plans). */
	footerSlot?: JSX.Element
}

/**
 * Single tier offer card (Yearly preselected alongside Monthly and any pass
 * option) with one interval radio group, direct price readout, and one
 * SubscribeButton checkout flow.
 */
export function PlusOffer(props: Props) {
	const observePricingRow = usePricingOfferVisibility()
	const translate = createTranslator(props.locale)
	const t = (key: string, values?: Record<string, string | number>) =>
		translate(`plus.pricing.${key}`, values)
	const options = createMemo(() =>
		[props.once, props.yearly, props.monthly].filter((card): card is PlanCard => Boolean(card)),
	)
	const defaultInterval = () =>
		props.initialPlan === null
			? undefined
			: (options().find((card) => card.id === props.initialPlan)?.interval ??
				props.yearly?.interval ??
				props.monthly?.interval ??
				props.once?.interval)
	const [interval, setInterval] = createSignal(defaultInterval())
	createEffect(() => setInterval(defaultInterval()))
	onMount(() => trackPlusViewStage(props.checkoutTrigger))
	const current = createMemo(() => options().find((card) => card.interval === interval()))
	const price = (card: PlanCard) => formatPrice(card.amountMinor, card.currency, props.locale)
	const chargeCadence = (card: PlanCard) => {
		if (card.interval === 'once') return t('oneTime')
		if (card.interval === 'year') return t(props.pricingPage ? 'billedYearly' : 'perYear')
		return t(props.pricingPage ? 'billedMonthly' : 'perMonth')
	}
	const saving = () => pricingYearlySaving(props.monthly, props.yearly)
	const features = () => props.features ?? []
	const benefits = () =>
		features().length > 0 ? (
			<ul class={styles.features}>
				<For each={features()}>
					{(line) => (
						<li class="flex items-start gap-2">
							<Check class="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
							{line}
						</li>
					)}
				</For>
			</ul>
		) : null

	return (
		<Show when={options().length > 0}>
			<div id={props.id} data-checkout-surface="" class={cn('scroll-mt-24', styles.offer)}>
				{!props.compact ? props.headerSlot : null}
				<div
					class={cn(
						'surface-card flex flex-col',
						props.compact ? 'p-3 sm:p-4' : 'p-4 sm:p-5',
						styles.card,
						props.emphasized && styles.featured,
					)}
				>
					<div class={cn(styles.cardHeading, props.compact && '!mb-2 !min-h-0 gap-1')}>
						<div class={cn(props.compact && 'flex items-center justify-between gap-2')}>
							<h2 class="flex items-center gap-2 font-display text-lg sm:text-xl">
								{props.accentDot ? (
									<span
										class="inline-block h-2.5 w-2.5 rounded-[3px] bg-accent-warm"
										aria-hidden="true"
									/>
								) : null}
								{props.title}
							</h2>
							{props.compact ? props.headerSlot : null}
						</div>
						<p class={cn('text-xs text-muted-foreground', !props.compact && 'sm:text-sm')}>
							{props.subtitle}
						</p>
					</div>
					{props.pricingPage ? benefits() : null}
					<fieldset class={cn('grid border-0 p-0', props.compact ? 'gap-1.5' : 'gap-2')}>
						<legend class="sr-only">{t('planChoice')}</legend>
						<For each={options()}>
							{(card) => {
								const isOnce = card.interval === 'once'
								const isYear = card.interval === 'year'
								const checked = () => card.interval === interval()
								let row!: HTMLLabelElement
								createEffect(() => {
									if (props.pricingPage && !props.subscribed && current()?.id === card.id)
										observePricingRow(row, props.id, card.id)
								})
								return (
									<label
										ref={row}
										class={cn(
											styles.option,
											'flex cursor-pointer items-center gap-3 rounded-xl border px-3',
											props.compact ? '!min-h-12 !py-1.5' : 'min-h-14 py-2',
											'transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring',
											checked() ? styles.selected : 'border-border hover:bg-muted/40',
										)}
									>
										<input
											type="radio"
											autocomplete={props.pricingPage ? 'off' : undefined}
											name={props.radioName}
											value={card.interval}
											checked={checked()}
											onChange={() => {
												setInterval(card.interval)
												props.onPlanChange?.(card)
											}}
											class="h-5 w-5 shrink-0 accent-primary"
										/>
										<span class="min-w-0 flex-1">
											<span class="flex flex-wrap items-center gap-x-2 font-semibold">
												{isOnce
													? t('weekendPass', { days: card.accessDays })
													: isYear
														? t('yearly')
														: t('monthly')}
												{isYear && saving() ? (
													<span class="chip bg-success/15 text-success">
														{t('saving', { percent: saving() ?? 0 })}
													</span>
												) : null}
											</span>
											{isYear ? (
												<span
													class={cn(
														'block text-muted-foreground tnum',
														props.compact ? 'text-xs' : 'text-sm',
													)}
												>
													{t(props.pricingPage ? 'annualMonthlyEquivalent' : 'monthlyEquivalent', {
														price: formatMonthlyEquivalentPrice(
															card.amountMinor,
															card.currency,
															props.locale,
														),
													})}
													{props.familyMax ? (
														<span class="block text-xs">
															{t('familyMonthlyPerPerson', {
																count: props.familyMax,
																price: formatFamilyMonthlyPerPerson(
																	card,
																	props.familyMax,
																	props.locale,
																),
															})}
														</span>
													) : null}
												</span>
											) : null}
										</span>
										<span class="text-right">
											<span
												class={cn('block font-display tnum', props.compact ? 'text-lg' : 'text-xl')}
											>
												{price(card)}
											</span>
											<span class="block text-xs text-muted-foreground">{chargeCadence(card)}</span>
										</span>
									</label>
								)
							}}
						</For>
					</fieldset>
					<Show when={current()} keyed>
						{(selected) => {
							const trialDays = () => (props.signedIn ? selected.trialDays : 0)
							return (
								<>
									<Show when={selected.interval === 'year' && trialDays() > 0}>
										<TrialChargeLine
											days={trialDays()}
											price={price(selected)}
											locale={props.locale}
										/>
									</Show>
									<div class={props.compact ? 'mt-2' : 'mt-3'}>
										<SubscribeButton
											checkoutTrigger={props.checkoutTrigger ?? 'pricing_card'}
											compact={props.compact}
											pricingPage={props.pricingPage}
											callbackUrl={props.callbackUrl}
											planId={selected.id}
											currency={selected.currency}
											amountMinor={selected.amountMinor}
											locale={props.locale}
											signedIn={props.signedIn}
											subscribed={props.subscribed}
											label={
												trialDays() > 0
													? t('startTrial', { days: trialDays() })
													: props.pricingPage && props.id === 'plus' && selected.interval !== 'once'
														? t('startPlus')
														: t('continueToPayment')
											}
											renewalNote={
												selected.interval === 'once'
													? t('passTerms', { days: selected.accessDays })
													: t(selected.interval === 'year' ? 'renewsYearly' : 'renewsMonthly', {
															price: price(selected),
														})
											}
										/>
									</div>
								</>
							)
						}}
					</Show>
					{!props.pricingPage ? benefits() : null}
				</div>
				{props.afterCheckout}
				{props.footerSlot}
			</div>
		</Show>
	)
}
