/** @jsxImportSource solid-js */
import { For, Show } from 'solid-js'
import { formatMonthlyEquivalentPrice, formatPrice } from '@/lib/billing/plus'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import type { readUnlockPrices } from './unlock-prices'

/** Yearly is the anchor; plan order, availability and savings come from the live catalogue. */
export function UnlockPlanList(props: {
	cards: Awaited<ReturnType<typeof readUnlockPrices>>['cards']
	locale: Locale
}) {
	const { locale } = props
	const t = createTranslator(locale)
	return (
		<Show
			when={props.cards.length}
			fallback={<p class="text-sm text-muted-foreground">{t('plus.pricing.unavailableTitle')}</p>}
		>
			<dl class="grid gap-1 rounded-xl bg-muted p-2 text-sm">
				<For each={props.cards}>
					{(card) => (
						<div
							class="flex items-start justify-between gap-3 rounded-lg px-2"
							classList={{
								'border border-border bg-card py-3': card.interval === 'year',
								'py-1.5': card.interval !== 'year',
							}}
							data-unlock-plan={card.id}
						>
							<dt class="min-w-0">
								<span class="flex flex-wrap items-center gap-x-2 font-semibold">
									{card.interval === 'once'
										? t('plus.pricing.weekendPass', { days: card.accessDays })
										: t(card.interval === 'year' ? 'plus.pricing.yearly' : 'plus.pricing.monthly')}
									<Show when={card.savingPercent} keyed>
										{(percent) => (
											<span class="chip bg-background text-foreground">
												{t('plus.pricing.saving', { percent })}
											</span>
										)}
									</Show>
								</span>
								<Show when={card.interval !== 'month'}>
									<span class="block text-xs text-muted-foreground tnum">
										{card.interval === 'once'
											? t('plus.pricing.oneTime')
											: t('plus.pricing.monthlyEquivalent', {
													price: formatMonthlyEquivalentPrice(
														card.amountMinor,
														card.currency,
														locale,
													),
												})}
									</span>
								</Show>
							</dt>
							<dd class="shrink-0 text-end font-semibold tnum">
								{formatPrice(card.amountMinor, card.currency, locale)}
								<Show when={card.interval !== 'once'}>
									<span class="block text-xs font-normal text-muted-foreground">
										{t(card.interval === 'year' ? 'plus.pricing.perYear' : 'plus.pricing.perMonth')}
									</span>
								</Show>
							</dd>
						</div>
					)}
				</For>
			</dl>
		</Show>
	)
}
