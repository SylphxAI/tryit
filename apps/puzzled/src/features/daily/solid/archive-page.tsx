/** @jsxImportSource solid-js */
import { ArrowRight, Crown } from 'lucide-solid'
import { Show } from 'solid-js'
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
	const yesterday = new Intl.DateTimeFormat(locale, {
		dateStyle: 'medium',
		timeZone: 'UTC',
	}).format(new Date(`${days[0]}T00:00:00Z`))
	const tCatalog = (key: string) => translate(`catalog.${key}`)
	const priceLine =
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

	return (
		<SiteShell data={props.data.shell} signedIn={props.data.signedIn}>
			<PageMeta value={props.data.meta} />
			<main
				id="main-content"
				tabIndex={-1}
				class="flex-1 bg-[#f7f5f0] [--color-hairline:rgb(26_23_18_/_0.08)] dark:bg-background dark:[--color-hairline:rgb(242_238_230_/_0.1)]"
			>
				<section class="page-shell-wide py-7 md:py-12">
					<div class="mb-5 md:mb-8">
						<div class="min-w-0">
							<p class="eyebrow">{t('eyebrow')}</p>
							<h1 class="editorial-title mt-2 font-[family-name:var(--font-display)] text-[clamp(2.5rem,2rem+2.25vw,4rem)] leading-[1.04] font-extrabold tracking-tight text-balance [&:is(:lang(zh),:lang(ja),:lang(ko))]:tracking-normal">
								{t('title')}
							</h1>
							<p class="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground sm:text-base">
								{t('yesterdayIntro', { date: yesterday, count: ARCHIVE_WINDOW_DAYS })}
							</p>
						</div>
					</div>
					<Show when={locked}>
						<aside
							aria-labelledby="archive-unlock-title"
							class="editorial-surface mb-5 grid items-center gap-3 rounded-2xl p-4 md:mb-6 md:grid-cols-[minmax(0,1fr)_auto] md:gap-6 md:p-5"
							data-archive-unlock
						>
							<div class="flex min-w-0 items-center gap-3">
								<span
									class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-warm-soft text-accent-warm-foreground md:size-12"
									aria-hidden="true"
								>
									<Crown size={20} />
								</span>
								<div class="min-w-0">
									<h2
										id="archive-unlock-title"
										class="font-display text-lg leading-tight md:text-xl"
									>
										{t('mobileUnlockTitle', { days: ARCHIVE_WINDOW_DAYS })}
									</h2>
									<p class="mt-1 text-sm leading-relaxed text-muted-foreground tabular-nums">
										{priceLine ??
											t('mobileUnlockBody', { count: ARCHIVE_WINDOW_DAYS, games: games.length })}
									</p>
								</div>
							</div>
							<a
								href={pricingHref}
								class="chrome-control chrome-primary w-full gap-2 px-5 text-center text-sm font-bold md:w-auto"
							>
								{t('mobileUnlockCta')}
								<ArrowRight size={16} aria-hidden="true" />
							</a>
						</aside>
					</Show>
					<section aria-labelledby="archive-list-title">
						<h2 id="archive-list-title" class="sr-only">
							{t('listTitle', { days: ARCHIVE_WINDOW_DAYS })}
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
								locked: t('requiresPlus'),
							}}
						/>
					</section>
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
