/** @jsxImportSource solid-js */
import { For, type JSX } from 'solid-js'
import { cn } from '@/lib/utils'

type MarketingHeroProps = {
	/** Optional breadcrumb trail above the eyebrow. */
	breadcrumb?: JSX.Element
	/** Short factual label above the h1 (e.g. the surface name). */
	eyebrow?: string
	/** The single h1 of the page. */
	title: string
	/** Value proposition in plain language; never a badge or a promise. */
	lead?: string
	/** Verifiable facts rendered as chips directly under the lead. */
	facts?: readonly string[]
	/** Primary actions (links/buttons) shown under the copy. */
	actions?: JSX.Element
	/** Optional panel rendered beside the copy on large screens. */
	aside?: JSX.Element
	class?: string
}

/**
 * Shared hero band for marketing surfaces (pricing, support, legal).
 *
 * Owns the page's only h1. The aurora field is decorative, so it stays behind
 * `aria-hidden` decoration-free markup: no text is ever placed on the field
 * without a solid surface behind it.
 */
export function MarketingHero(props: MarketingHeroProps) {
	return (
		<section class={cn('relative', props.class)}>
			<div class="page-shell-wide pb-8 pt-8 md:pb-12 md:pt-14">
				<div
					class={cn(
						'animate-enter',
						props.aside && 'grid items-start gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12',
					)}
				>
					<div>
						{props.breadcrumb}
						{props.eyebrow && <p class="props.eyebrow">{props.eyebrow}</p>}
						<h1 class="mt-2 font-display text-[2.125rem] leading-[1.06] text-balance sm:text-5xl lg:text-[3.5rem]">
							{props.title}
						</h1>
						{props.lead && (
							<p class="mt-4 max-w-2xl text-[17px] leading-relaxed text-muted-foreground md:text-lg">
								{props.lead}
							</p>
						)}
						{props.facts && props.facts.length > 0 && (
							<ul class="mt-5 flex flex-wrap gap-2">
								<For each={props.facts}>
									{(fact) => (
										<li class="chip border border-border bg-card font-medium text-muted-foreground">
											{fact}
										</li>
									)}
								</For>
							</ul>
						)}
						{props.actions && (
							<div class="mt-6 flex flex-wrap items-center gap-3">{props.actions}</div>
						)}
					</div>
					{props.aside}
				</div>
			</div>
		</section>
	)
}
