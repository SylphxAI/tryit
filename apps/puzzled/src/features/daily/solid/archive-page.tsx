/** @jsxImportSource solid-js */
import { ArrowDown, Crown } from 'lucide-solid'
import { AdSlot } from '@/features/ads/solid/ad-slot'
import { CheckoutOffer } from '@/features/plus/solid/checkout-offer'
import { createTranslator } from '@/lib/i18n/translate'
import { localizedPath } from '@/lib/seo/urls'
import { PageMeta } from '@/shared/solid/page-meta'
import { SiteShell } from '@/shared/solid/site-shell'
import { ARCHIVE_WINDOW_DAYS } from '../lib/archive-days'
import { ArchiveAlmanac } from './archive-almanac'
import type { ArchivePageData } from './archive-data'

export function ArchivePage(props: { data: ArchivePageData }) {
	// The route keys this view by request snapshot (including locale and entitlement).
	const { locale, locked, prices: offerPrices, ads, games, days, categories } = props.data
	const translate = createTranslator(locale)
	const t = (key: string, values?: Record<string, string | number>) =>
		translate(`archive.${key}`, values)
	const tOffer = (key: string, values: Record<string, string | number>) =>
		translate(`plus.offer.${key}`, values)
	const tPlus = (key: string) => translate(`plus.${key}`)
	const tCatalog = (key: string) => translate(`catalog.${key}`)
	const mobilePriceLine =
		offerPrices.passPrice && offerPrices.yearlyPrice
			? tOffer('resultPriceWithPass', {
					days: offerPrices.passDays ?? 3,
					passPrice: offerPrices.passPrice,
					plan: tPlus('name'),
					price: offerPrices.yearlyPrice,
				})
			: offerPrices.passPrice
				? tOffer('resultPassPrice', {
						days: offerPrices.passDays ?? 3,
						passPrice: offerPrices.passPrice,
					})
				: offerPrices.yearlyPrice
					? tOffer('resultPrice', { plan: tPlus('name'), price: offerPrices.yearlyPrice })
					: null

	return (
		<SiteShell data={props.data.shell}>
			<PageMeta value={props.data.meta} />
			<main id="main-content" class="flex-1">
				<section class="page-shell-wide py-6 md:py-10">
					<div
						class={
							locked
								? 'grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-8'
								: 'grid items-start gap-6'
						}
					>
						<div class="min-w-0">
							<div class="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
								<div class="min-w-0">
									<p class="eyebrow">{t('eyebrow')}</p>
									<h1 class="mt-1.5 font-display text-3xl leading-tight md:text-4xl">
										{t('title')}
									</h1>
									<p class="mt-2 max-w-2xl text-[15px] text-muted-foreground">
										{t('listBody', { count: ARCHIVE_WINDOW_DAYS, games: games.length })}
									</p>
								</div>
								<a
									href={localizedPath(locale, '/games')}
									class="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4"
								>
									{t('backToGames')}
								</a>
							</div>
							{locked ? (
								<div
									data-archive-mobile-unlock=""
									class="mt-4 rounded-2xl border-2 border-foreground bg-card p-3.5 shadow-[0_3px_0_0_var(--color-foreground)] lg:hidden"
								>
									<div class="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
										<div class="min-w-0">
											<p class="flex items-center gap-1.5 font-display text-base leading-snug">
												<Crown class="h-4 w-4 shrink-0 text-accent-warm" aria-hidden="true" />
												{t('mobileUnlockTitle')}
											</p>
											{mobilePriceLine ? (
												<p class="mt-0.5 text-xs font-semibold text-muted-foreground tnum">
													{mobilePriceLine}
												</p>
											) : (
												<p class="mt-0.5 text-xs text-muted-foreground">
													{t('mobileUnlockBody', {
														count: ARCHIVE_WINDOW_DAYS,
														games: games.length,
													})}
												</p>
											)}
										</div>
										<a
											href="#archive-unlock"
											class="pressable inline-flex min-h-12 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#f4b42a] px-4 text-sm font-bold text-[#1a1712] shadow-[0_3px_0_0_#c98a0b] transition-colors hover:bg-[#f7c24e] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
										>
											{t('mobileUnlockCta')}
											<ArrowDown class="h-4 w-4" aria-hidden="true" />
										</a>
									</div>
								</div>
							) : null}
							<section class="mt-5" aria-labelledby="archive-list-title">
								<h2 id="archive-list-title" class="sr-only">
									{t('listTitle')}
								</h2>
								<ArchiveAlmanac
									days={days}
									games={games}
									locale={locale}
									locked={locked}
									categories={categories}
									labels={{
										dayPicker: t('dayPicker'),
										filter: t('filterLabel'),
										all: tCatalog('filterAll'),
										yesterday: t('yesterday'),
										dayCount: String(translate.raw('archive.dayCount')),
										play: t('play'),
										locked: t('locked'),
									}}
								/>
							</section>
						</div>
						{locked ? (
							<aside id="archive-unlock" class="scroll-mt-20 lg:sticky lg:top-20">
								<CheckoutOffer
									locale={locale}
									data={props.data.offer}
									signedIn={props.data.signedIn}
									callbackUrl={localizedPath(locale, '/archive')}
									gameCount={games.length}
									checkoutTrigger="archive_banner"
								/>
							</aside>
						) : null}
					</div>
					{ads ? (
						<div class="mt-8 max-w-2xl">
							<AdSlot config={ads} label={translate('common.advertisement')} />
						</div>
					) : null}
				</section>
			</main>
		</SiteShell>
	)
}
