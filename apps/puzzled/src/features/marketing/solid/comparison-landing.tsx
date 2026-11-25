/** @jsxImportSource solid-js */

import { For } from 'solid-js'
import { CurrencySwitcher } from '@/features/plus/solid/currency-switcher'
import { getGameMetadata } from '@/games/registry'
import { getGameColors } from '@/games/theme-colors'
import { gamePath } from '@/lib/game-slug'
import type { Locale } from '@/lib/i18n/config'
import { JsonLd } from '@/shared/solid/json-ld'
import { type comparisonPricing, comparisonPricingFaqs } from '../components/comparison-pricing'
import { COMPARISON_HUB_PATH } from '../components/comparison-slugs'
import { COMPARISON_HUB, type ComparisonSpec } from '../components/comparison-specs'
import {
	comparisonBreadcrumbJsonLd,
	INK_SECONDARY_CTA,
	PLAY_CTA,
	SECONDARY_CTA,
} from '../components/editorial-presentation'
import { buildUseCaseJsonLd } from '../components/use-case-specs'
import { ArrowRight, Check } from './editorial-icons'
import { EditorialLink } from './editorial-link'
import { MarketingCta } from './marketing-cta'
import { MarketingFaq } from './marketing-faq'
import { MarketingHero } from './marketing-hero'
import { MarketingSection } from './marketing-section'

/**
 * An honest "Tryit vs X" page: a short verdict first, the side-by-side table,
 * credit where the other product is stronger, then closest-match games.
 */
export function ComparisonLanding({
	spec,
	origin,
	locale,
	pricing,
}: {
	spec: ComparisonSpec
	origin: string
	locale: Locale
	pricing: ReturnType<typeof comparisonPricing>
}) {
	const faqs = comparisonPricingFaqs(spec, pricing)
	const landing = buildUseCaseJsonLd({ ...spec, faqs, offers: pricing.offers }, origin)
	const structuredData = {
		...landing,
		'@graph': [...landing['@graph'], comparisonBreadcrumbJsonLd(spec, origin)],
	}

	return (
		<main id="main-content" tabIndex={-1} lang="en-US" class="flex-1 pb-16">
			<MarketingHero
				breadcrumb={
					<nav aria-label="Breadcrumb" class="-mt-3 mb-1">
						<ol class="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
							<li>
								<EditorialLink
									href={COMPARISON_HUB_PATH}
									class="inline-flex min-h-11 items-center font-semibold text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
								>
									{COMPARISON_HUB.eyebrow}
								</EditorialLink>
							</li>
							<li aria-hidden="true">/</li>
							<li aria-current="page">{`Tryit vs ${spec.rival}`}</li>
						</ol>
					</nav>
				}
				eyebrow={spec.eyebrow}
				title={spec.h1}
				lead={spec.lead}
				facts={spec.facts}
				actions={
					<>
						<EditorialLink href={spec.primaryCta.href} class={PLAY_CTA}>
							{spec.primaryCta.label}
							<ArrowRight class="h-4 w-4" />
						</EditorialLink>
						<EditorialLink href={spec.secondaryCta.href} class={SECONDARY_CTA}>
							{spec.secondaryCta.label}
						</EditorialLink>
					</>
				}
				aside={
					<aside
						aria-labelledby="verdict-heading"
						class="surface-card relative overflow-hidden p-6 pl-8 md:p-7 md:pl-9"
					>
						<span class="absolute inset-y-0 left-0 w-1.5 bg-cta" aria-hidden="true" />
						<h2 id="verdict-heading" class="font-display text-xl">
							{spec.verdictTitle}
						</h2>
						<ul class="mt-3 space-y-3 text-[15px] leading-relaxed text-muted-foreground">
							<For each={spec.verdict}>{(line) => <li>{line}</li>}</For>
						</ul>
					</aside>
				}
			/>

			<MarketingSection
				id="side-by-side"
				title={spec.tableTitle}
				subtitle={spec.tableSubtitle}
				action={
					pricing.currencies.length > 1 ? (
						<div lang={locale}>
							<CurrencySwitcher
								locale={locale}
								currencies={pricing.currencies}
								current={pricing.currency}
							/>
						</div>
					) : undefined
				}
				flush
			>
				{pricing.note && <p class="mb-3 text-sm text-muted-foreground">{pricing.note}</p>}
				<div class="surface-card overflow-hidden">
					<table class="block w-full border-collapse text-left text-sm md:table">
						<caption class="sr-only">{spec.tableTitle}</caption>
						<thead class="sr-only md:not-sr-only">
							<tr class="border-b border-border bg-muted/40">
								<th scope="col" class="w-1/5 px-5 py-3.5 font-display text-sm font-semibold">
									Feature
								</th>
								<th scope="col" class="w-2/5 px-5 py-3.5 font-display text-sm font-semibold">
									{spec.rival}
								</th>
								<th
									scope="col"
									class="w-2/5 bg-accent-warm-soft px-5 py-3.5 font-display text-sm font-semibold"
								>
									Tryit
								</th>
							</tr>
						</thead>
						<tbody class="block md:table-row-group">
							<For each={spec.rows}>
								{(row) => (
									<tr class="block border-b border-border px-5 py-4 last:border-b-0 md:table-row md:p-0">
										<th
											scope="row"
											class="block font-display text-base font-semibold text-foreground md:table-cell md:px-5 md:py-4 md:align-top md:text-sm"
										>
											{row.feature}
										</th>
										<td class="mt-2 block text-muted-foreground md:mt-0 md:table-cell md:px-5 md:py-4 md:align-top">
											<span class="eyebrow block md:hidden">{spec.rival}</span>
											{row.them}
										</td>
										<td class="mt-3 block rounded-xl bg-accent-warm-soft p-3 font-medium text-foreground md:mt-0 md:table-cell md:rounded-none md:px-5 md:py-4 md:align-top">
											<span class="eyebrow block md:hidden">Tryit</span>
											{row.pricing ? pricing.rows[row.pricing] : row.us}
										</td>
									</tr>
								)}
							</For>
						</tbody>
					</table>
				</div>
			</MarketingSection>

			<MarketingSection id="strengths">
				<div class="grid gap-4 lg:grid-cols-2">
					<section aria-labelledby="their-strengths" class="surface-card p-6 md:p-7">
						<h2 id="their-strengths" class="font-display text-2xl text-balance">
							{spec.theirStrengthsTitle}
						</h2>
						<ul class="mt-4 space-y-4">
							<For each={spec.theirStrengths}>
								{(point) => (
									<li>
										<h3 class="font-display text-lg">{point.title}</h3>
										<p class="mt-1 text-sm leading-relaxed text-muted-foreground">{point.body}</p>
									</li>
								)}
							</For>
						</ul>
					</section>
					<section
						aria-labelledby="our-strengths"
						class="rounded-2xl border-2 border-foreground bg-card p-6 shadow-card md:p-7"
					>
						<h2 id="our-strengths" class="font-display text-2xl text-balance">
							{spec.ourStrengthsTitle}
						</h2>
						<ul class="mt-4 space-y-4">
							<For each={spec.ourStrengths}>
								{(point) => (
									<li class="flex gap-3">
										<Check class="mt-1 h-5 w-5 shrink-0 text-success" />
										<div>
											<h3 class="font-display text-lg">{point.title}</h3>
											<p class="mt-1 text-sm leading-relaxed text-muted-foreground">{point.body}</p>
										</div>
									</li>
								)}
							</For>
						</ul>
					</section>
				</div>
			</MarketingSection>

			<MarketingSection id="pairings" title={spec.pairingsTitle} subtitle={spec.pairingsSubtitle}>
				<ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					<For each={spec.pairings}>
						{(pairing) => {
							const game = getGameMetadata(pairing.slug)
							if (!game) return null
							const colors = getGameColors(game.display.theme)
							return (
								<li>
									<EditorialLink
										href={gamePath(pairing.slug)}
										class="surface-card group flex h-full overflow-hidden transition-shadow hover:shadow-lift focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
									>
										<span class={`w-2 shrink-0 ${colors.stripe}`} aria-hidden="true" />
										<span class="flex flex-col p-5">
											<span class="eyebrow">{`Like ${pairing.theirs}?`}</span>
											<span class="mt-1 flex items-center gap-1.5 font-display text-xl">
												{`Try ${game.name}`}
												<ArrowRight class="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
											</span>
											<span class="mt-1 text-sm leading-relaxed text-muted-foreground">
												{pairing.why}
											</span>
										</span>
									</EditorialLink>
								</li>
							)
						}}
					</For>
				</ul>
			</MarketingSection>

			<MarketingFaq id="faq" title={spec.faqTitle} items={faqs} emitStructuredData={false} />

			<MarketingCta title={spec.closingCta.title} body={spec.closingCta.body}>
				<EditorialLink href={spec.primaryCta.href} class={PLAY_CTA}>
					{spec.primaryCta.label}
					<ArrowRight class="h-4 w-4" />
				</EditorialLink>
				<EditorialLink href={spec.secondaryCta.href} class={INK_SECONDARY_CTA}>
					{spec.secondaryCta.label}
				</EditorialLink>
			</MarketingCta>

			<div class="page-shell-wide">
				<p class="max-w-3xl text-xs leading-relaxed text-muted-foreground">{spec.disclaimer}</p>
			</div>

			<JsonLd value={structuredData} />
		</main>
	)
}
