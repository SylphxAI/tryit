/** @jsxImportSource solid-js */
import { ArrowLeft, ArrowRight, Crown } from 'lucide-solid'
import { AdSlot } from '@/features/ads/solid/ad-slot'
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

	const pricingHref = localizedPath(
		locale,
		`/pricing?${new URLSearchParams({ callbackUrl: localizedPath(locale, '/archive'), trigger: 'archive_banner' })}`,
	)
	const unlock = () => (
		<aside class="editorial-surface rounded-2xl border border-hairline bg-card p-4 shadow-md md:p-5">
			<h2 class="flex items-center gap-2.5 font-display text-lg leading-tight lg:flex-col lg:items-start">
				<span
					class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-warm-soft text-accent-warm-foreground lg:size-10"
					aria-hidden="true"
				>
					<Crown size={18} />
				</span>
				{t('mobileUnlockTitle')}
			</h2>
			<p class="mt-1.5 text-sm leading-relaxed text-muted-foreground tabular-nums">
				{mobilePriceLine ??
					t('mobileUnlockBody', { count: ARCHIVE_WINDOW_DAYS, games: games.length })}
			</p>
			<a
				href={pricingHref}
				class="editorial-interactive mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-cta px-4 py-2 text-center text-sm font-bold text-cta-foreground shadow-sm hover:bg-cta-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
			>
				{t('mobileUnlockCta')}
				<ArrowRight size={16} class="shrink-0" aria-hidden="true" />
			</a>
		</aside>
	)

	return (
		<SiteShell data={props.data.shell} signedIn={props.data.signedIn}>
			<PageMeta value={props.data.meta} />
			<main
				id="main-content"
				tabIndex={-1}
				class="flex-1 bg-[#f7f5f0] [--color-hairline:rgb(26_23_18_/_0.08)] dark:bg-background dark:[--color-hairline:rgb(242_238_230_/_0.1)]"
			>
				<section class="page-shell-wide py-7 md:py-12">
					<div class="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 md:mb-8">
						<div class="min-w-0">
							<p class="eyebrow">{t('eyebrow')}</p>
							<h1 class="editorial-title mt-2 font-[family-name:var(--font-display)] text-[clamp(2.5rem,2rem+2.25vw,4rem)] leading-[1.04] font-extrabold tracking-tight text-balance [&:is(:lang(zh),:lang(ja),:lang(ko))]:tracking-normal">
								{t('title')}
							</h1>
							<p class="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground sm:text-base">
								{t('listBody', { count: ARCHIVE_WINDOW_DAYS, games: games.length })}
							</p>
						</div>
						<a
							href={localizedPath(locale, '/games')}
							class="chrome-control inline-flex min-h-11 w-auto items-center gap-2 rounded-full px-3 text-sm font-semibold hover:bg-accent"
						>
							<ArrowLeft size={16} class="shrink-0" aria-hidden="true" />
							{t('backToGames')}
						</a>
					</div>
					<div
						class={
							locked
								? 'grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-6 xl:grid-cols-[minmax(0,1fr)_19rem]'
								: 'grid items-start gap-6'
						}
					>
						<div class="min-w-0">
							{locked && (
								<div class="mb-4 lg:hidden" data-archive-mobile-unlock>
									{unlock()}
								</div>
							)}
							<section aria-labelledby="archive-list-title">
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
						{locked && (
							<div class="hidden lg:sticky lg:top-20 lg:block" data-archive-unlock>
								{unlock()}
							</div>
						)}
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
