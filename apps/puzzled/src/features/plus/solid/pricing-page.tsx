/** @jsxImportSource solid-js */
import { Check, Play } from 'lucide-solid'
import { For } from 'solid-js'
import { MarketingHero } from '@/features/marketing/solid/marketing-hero'
import { MarketingSection } from '@/features/marketing/solid/marketing-section'
import { formatPrice } from '@/lib/billing/plus'
import { createTranslator } from '@/lib/i18n/translate'
import { localizedPath } from '@/lib/seo/urls'
import { cn } from '@/lib/utils'
import { PageMeta } from '@/shared/solid/page-meta'
import { SiteShell } from '@/shared/solid/site-shell'
import { CurrencySwitcher } from './currency-switcher'
import { PlusOffer } from './plus-offer'
import styles from './pricing.module.css'
import type { PricingData } from './pricing-data'

export function PricingPage(props: { data: PricingData }) {
	return (
		<SiteShell data={props.data.shell}>
			<PageMeta value={props.data.meta} />
			<PricingBody data={props.data} />
		</SiteShell>
	)
}

function PricingBody({ data }: { data: PricingData }) {
	const {
		locale,
		cards,
		gameCount,
		freeSlug,
		freeName,
		currencies,
		currency,
		familyMax,
		plusMember,
		signedIn,
		checkout,
		plan,
		callbackUrl,
		plusCheckoutTrigger,
		familyCheckoutTrigger,
	} = data
	const translate = createTranslator(locale)
	const t = (key: string, values?: Record<string, string | number>) =>
		translate(`plus.pricing.${key}`, values)
	const tPlus = (key: string) => translate(`plus.${key}`)
	const href = (path: string) => localizedPath(locale, path)
	const monthly = (family: boolean) =>
		cards.find((card) => card.family === family && card.interval === 'month')
	const yearly = (family: boolean) =>
		cards.find((card) => card.family === family && card.interval === 'year')
	const includes = (family: boolean) => [
		t('includesAllGames', { count: gameCount }),
		t('includesArchive'),
		t('includesStats'),
		...(family ? [t('includesFamily', { count: familyMax })] : []),
	]

	const plusOnce = cards.find((card) => !card.family && card.interval === 'once')
	const plusYear = yearly(false)
	const plusMonth = monthly(false)
	const familyYear = yearly(true)
	const familyMonth = monthly(true)
	const memberButtonClass = [
		'pressable inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full',
		'bg-primary px-5 font-semibold text-primary-foreground transition-colors hover:bg-primary-hover',
		'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
	].join(' ')
	const textLinkClass = [
		'inline-flex min-h-11 items-center justify-center text-[15px] font-semibold',
		'underline underline-offset-4 hover:text-foreground',
	].join(' ')

	if (cards.length === 0) {
		return (
			<main
				id="main-content"
				tabIndex={-1}
				data-pricing-page=""
				class={cn('flex-1', styles.page, styles.closed)}
			>
				<MarketingHero
					eyebrow={tPlus('name')}
					title={t('title')}
					lead={t('lead', { count: gameCount })}
					actions={
						<a
							href={href(`/games/${freeSlug}`)}
							class="pressable inline-flex h-12 items-center gap-2 rounded-full border border-border bg-card px-5 font-semibold transition-colors hover:bg-muted"
						>
							<Play class="h-4 w-4" aria-hidden="true" />
							{t('playFree', { game: freeName })}
						</a>
					}
				/>
				<MarketingSection id="plans" flush>
					<div class="surface-card max-w-xl p-6 sm:p-7">
						<p class="flex items-center gap-2 text-sm font-semibold">
							<span
								class="inline-block h-2.5 w-2.5 rounded-[3px] bg-accent-warm"
								aria-hidden="true"
							/>
							{tPlus('name')}
						</p>
						<h2 class="mt-2 font-display text-2xl">{t('closedTitle')}</h2>
						<p class="mt-2 text-[15px] text-muted-foreground">{t('closedBody')}</p>
						<p class="mt-1 text-[15px] font-semibold">{t('purchasesSoon')}</p>
						<ul class="mt-5 space-y-2.5 border-t border-border pt-5">
							<For each={includes(true)}>
								{(line) => (
									<li class="flex items-start gap-2.5 text-[15px]">
										<Check class="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
										{line}
									</li>
								)}
							</For>
						</ul>
					</div>
				</MarketingSection>
			</main>
		)
	}

	const individualFooter = (
		<div class="mt-1 flex flex-col items-center">
			<a href="#family" class={textLinkClass}>
				{t('familyLink', { count: familyMax })}
			</a>
			<a href={href(`/games/${freeSlug}`)} class={textLinkClass}>
				{t('notNowPlayFree')}
			</a>
		</div>
	)

	return (
		<main id="main-content" tabIndex={-1} data-pricing-page="" class={cn('flex-1', styles.page)}>
			<section class={cn('page-shell-wide pb-8 pt-4 md:pb-10 md:pt-6 lg:pt-5', styles.shell)}>
				{checkout === 'cancelled' ? (
					<output class="mb-3 block rounded-xl bg-muted px-4 py-3 text-sm">
						{t('checkoutCancelled')}
					</output>
				) : null}
				<div class={styles.intro}>
					<p class={styles.eyebrow}>{tPlus('name')}</p>
					<CurrencySwitcher locale={locale} currencies={currencies} current={currency} />
					<h1
						class={cn(
							styles.title,
							'mt-1 font-display text-[1.75rem] leading-tight text-balance',
							'lg:mt-1.5 lg:text-4xl',
						)}
					>
						{t('title')}
					</h1>
					<p class="mt-1.5 text-[15px] text-muted-foreground lg:mt-1.5 lg:text-base">
						{t('offerLead', { count: gameCount })}
					</p>
				</div>
				<div class={styles.tray}>
					{plusMember ? (
						<div id="plus" class={cn('scroll-mt-24', styles.offer)}>
							<div class={cn('surface-card p-5', styles.card, styles.featured)}>
								<p class="font-display text-xl">{t('currentPlan')}</p>
								<a href={href('/settings/subscription')} class={cn(memberButtonClass, 'mt-4')}>
									{t('manage')}
								</a>
							</div>
							{individualFooter}
						</div>
					) : (
						<PlusOffer
							id="plus"
							title={tPlus('name')}
							subtitle={t('individualBody')}
							accentDot
							emphasized
							features={includes(false)}
							radioName="plus-interval"
							returnAnchor="plus"
							initialPlan={plan}
							callbackUrl={callbackUrl}
							checkoutTrigger={plusCheckoutTrigger}
							once={plusOnce}
							yearly={plusYear}
							monthly={plusMonth}
							locale={locale}
							signedIn={signedIn}
							subscribed={false}
							footerSlot={individualFooter}
						/>
					)}
					{familyYear || familyMonth ? (
						<PlusOffer
							id="family"
							title={t('family')}
							subtitle={t('familyBody', { count: familyMax })}
							features={includes(true)}
							radioName="family-interval"
							returnAnchor="family"
							initialPlan={plan}
							callbackUrl={callbackUrl}
							checkoutTrigger={familyCheckoutTrigger}
							yearly={familyYear}
							monthly={familyMonth}
							locale={locale}
							signedIn={signedIn}
							subscribed={plusMember}
						/>
					) : null}
				</div>
			</section>

			<MarketingSection id="plans" class="pt-0 md:pt-0">
				<div
					class={cn(
						styles.free,
						'flex flex-col justify-between gap-4 rounded-2xl border border-border p-5',
						'sm:flex-row sm:items-center sm:p-6',
					)}
				>
					<div>
						<h2 class="font-display text-xl">{t('freeTitle')}</h2>
						<p class="mt-1 text-sm text-muted-foreground">{t('freeBody')}</p>
					</div>
					<p class="shrink-0 font-display text-3xl tnum">{formatPrice(0, currency, locale)}</p>
				</div>
				<p class="mt-6 max-w-3xl text-xs leading-relaxed text-muted-foreground">
					{t('legal')}{' '}
					<a href={href('/terms#subscriptions')} class="underline">
						{t('manage')}
					</a>
				</p>
			</MarketingSection>
		</main>
	)
}
