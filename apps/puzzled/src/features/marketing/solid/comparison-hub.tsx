/** @jsxImportSource solid-js */

import { For } from 'solid-js'
import { getGameMetadata } from '@/games/registry'
import { getGameColors } from '@/games/theme-colors'
import { JsonLd } from '@/shared/solid/json-ld'
import { COMPARISON_HUB, COMPARISONS, type ComparisonSpec } from '../components/comparison-specs'
import {
	buildComparisonHubJsonLd,
	INK_SECONDARY_CTA,
	PLAY_CTA,
	SECONDARY_CTA,
} from '../components/editorial-presentation'
import { ArrowRight } from './editorial-icons'
import { EditorialLink } from './editorial-link'
import { MarketingCta } from './marketing-cta'
import { MarketingHero } from './marketing-hero'
import { MarketingSection } from './marketing-section'

/**
 * One comparison as a printed card: the field shows the board of the Tryit
 * game nearest to the rival's best-known one, then the two-line verdict. The
 * whole card is the link.
 */
function ComparisonCard({ spec, cta }: { spec: ComparisonSpec; cta: string }) {
	const [pairing] = spec.pairings
	const game = pairing ? getGameMetadata(pairing.slug) : null
	const colors = game ? getGameColors(game.display.theme) : null
	const [theirs, ours] = spec.verdict

	return (
		<EditorialLink
			href={spec.path}
			data-comparison-card={spec.slug}
			class="tactile-card group flex h-full flex-col overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
		>
			<div
				class={`tactile-card-field relative aspect-[16/7] overflow-hidden px-3 py-2 ${colors?.bg ?? 'bg-muted'}`}
			>
				{pairing && game && (
					<>
						{/* biome-ignore lint/performance/noImgElement: local decorative SVG with explicit dimensions */}
						<img
							src={`/motifs/${pairing.slug}.svg`}
							alt=""
							width={160}
							height={100}
							loading="lazy"
							decoding="async"
							class="block h-full w-full object-contain transition-transform duration-medium ease-out group-hover:scale-[1.04]"
						/>
						<span class="absolute bottom-2 left-2 max-w-[calc(100%-1rem)] truncate rounded-full border border-[#1a1712] bg-[#fbf9f4] px-2 py-0.5 text-[11px] font-semibold leading-4 text-[#1a1712]">
							{`Like ${pairing.theirs}? Try ${game.name}`}
						</span>
					</>
				)}
			</div>
			<div class="flex flex-1 flex-col p-4 sm:p-5">
				<h3 class="font-display text-xl leading-tight">{`Tryit vs ${spec.rival}`}</h3>
				<p class="mt-2 text-sm leading-relaxed text-muted-foreground">{theirs}</p>
				<p class="mt-2 flex-1 text-sm font-medium leading-relaxed text-foreground">
					<span
						class="mr-1.5 inline-block h-2.5 w-2.5 rounded-[3px] border border-foreground bg-cta align-baseline"
						aria-hidden="true"
					/>
					{ours}
				</p>
				<span class="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground underline-offset-4 group-hover:underline">
					{cta}
					<ArrowRight class="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
				</span>
			</div>
		</EditorialLink>
	)
}

/**
 * `/vs`: every comparison on one broadsheet page. The masthead rule and the
 * printed cards are the home page's; the copy is each comparison's own short
 * answer, so the hub never states a fact its page does not.
 */
export function ComparisonHub(props: { origin: string }) {
	const hub = COMPARISON_HUB

	return (
		<main lang="en-US" class="pb-16">
			<MarketingHero
				eyebrow={hub.eyebrow}
				title={hub.h1}
				lead={hub.lead}
				facts={hub.facts}
				actions={
					<>
						<EditorialLink href={hub.primaryCta.href} class={PLAY_CTA}>
							{hub.primaryCta.label}
							<ArrowRight class="h-4 w-4" />
						</EditorialLink>
						<EditorialLink href={hub.secondaryCta.href} class={SECONDARY_CTA}>
							{hub.secondaryCta.label}
						</EditorialLink>
					</>
				}
			/>

			<section aria-labelledby="comparisons-heading" class="page-shell-wide">
				<ul class="masthead-rule flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs text-muted-foreground sm:text-[13px]">
					<For each={hub.masthead}>
						{(label, index) => (
							<li class="flex items-center gap-3">
								{index() > 0 && (
									<span aria-hidden="true" class="text-foreground/40">
										·
									</span>
								)}
								<span class={index() === 0 ? 'font-semibold text-foreground' : undefined}>
									{label}
								</span>
							</li>
						)}
					</For>
				</ul>
				<div class="mt-6">
					<h2 id="comparisons-heading" class="font-display text-2xl text-balance md:text-3xl">
						{hub.listTitle}
					</h2>
					<p class="mt-2 max-w-2xl leading-relaxed text-muted-foreground">{hub.listSubtitle}</p>
				</div>
				<ul class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					<For each={COMPARISONS}>
						{(spec) => (
							<li>
								<ComparisonCard spec={spec} cta={hub.cardCta} />
							</li>
						)}
					</For>
				</ul>
			</section>

			<MarketingSection id="how-we-compare" title={hub.principlesTitle}>
				<ul class="grid gap-6 border-t border-foreground pt-6 md:grid-cols-3">
					<For each={hub.principles}>
						{(point) => (
							<li>
								<h3 class="font-display text-lg">{point.title}</h3>
								<p class="mt-1 text-sm leading-relaxed text-muted-foreground">{point.body}</p>
							</li>
						)}
					</For>
				</ul>
			</MarketingSection>

			<MarketingCta title={hub.closingCta.title} body={hub.closingCta.body}>
				<EditorialLink href={hub.primaryCta.href} class={PLAY_CTA}>
					{hub.primaryCta.label}
					<ArrowRight class="h-4 w-4" />
				</EditorialLink>
				<EditorialLink href={hub.secondaryCta.href} class={INK_SECONDARY_CTA}>
					{hub.secondaryCta.label}
				</EditorialLink>
			</MarketingCta>

			<JsonLd value={buildComparisonHubJsonLd(props.origin)} />
		</main>
	)
}
