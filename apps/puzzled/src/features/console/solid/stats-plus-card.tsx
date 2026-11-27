/** @jsxImportSource solid-js */

import { ArrowRight, Crown } from 'lucide-solid'
import { localizedPath } from '@/lib/seo/urls'
import type { StatsPageData } from './stats-data'
import { statsTranslator } from './stats-text'

export function renderStatsPlusCard(
	locale: StatsPageData['locale'],
	moduleCount: number,
	offerPrices: NonNullable<StatsPageData['offerPrices']>,
) {
	const t = statsTranslator(locale)
	const statsPriceLine =
		offerPrices?.passPrice && offerPrices?.yearlyPrice
			? t.full('plus.offer.resultPriceWithPass', {
					days: offerPrices.passDays ?? 3,
					passPrice: offerPrices?.passPrice,
					plan: t.full('plus.name'),
					price: offerPrices?.yearlyPrice,
				})
			: offerPrices?.passPrice
				? t.full('plus.offer.resultPassPrice', {
						days: offerPrices.passDays ?? 3,
						passPrice: offerPrices?.passPrice,
					})
				: offerPrices?.yearlyPrice
					? t.full('plus.offer.resultPrice', {
							plan: t.full('plus.name'),
							price: offerPrices?.yearlyPrice,
						})
					: null

	return (
		<section
			aria-labelledby="stats-plus-card-title"
			data-stats-plus-card=""
			class="rounded-2xl border border-border bg-card/80 p-4 sm:p-5"
		>
			<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div class="min-w-0">
					<h2
						id="stats-plus-card-title"
						class="flex items-center gap-2 font-display text-base sm:text-lg"
					>
						<Crown class="h-4 w-4 shrink-0 text-accent-warm" aria-hidden="true" />
						{t('plusCard.title', { count: moduleCount })}
					</h2>
					<p class="mt-1 text-sm text-muted-foreground">
						{t('plusCard.body', { count: moduleCount })}
					</p>
					{statsPriceLine ? (
						<p class="mt-1 text-xs font-semibold text-foreground/85 tnum">{statsPriceLine}</p>
					) : null}
				</div>
				<a
					href={localizedPath(locale, '/pricing?entry_surface=stats_banner')}
					class="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-4 text-sm font-semibold transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
				>
					{t('plusCard.cta')}
					<ArrowRight class="h-4 w-4" aria-hidden="true" />
				</a>
			</div>
		</section>
	)
}
