/** @jsxImportSource solid-js */
import type { JSX } from 'solid-js'
import { cn } from '@/lib/utils'

type MarketingCtaProps = {
	title: string
	body?: string
	/** Links or buttons; keep the primary action first. */
	children: JSX.Element
	/** Optional supporting line under the actions (e.g. a policy note). */
	note?: string
	class?: string
}

/**
 * Inverted brand band that closes a marketing surface.
 *
 * The band is the only place a page uses the ink surface, so the closing call
 * to action stays recognisable across pricing, support and legal pages.
 */
export function MarketingCta(props: MarketingCtaProps) {
	return (
		<section class={cn('pb-12 md:pb-16', props.class)}>
			<div class="page-shell-wide">
				<div class="surface-ink relative overflow-hidden rounded-3xl px-6 py-10 text-center md:px-12 md:py-12">
					<div
						class="bg-grid-faint pointer-events-none absolute inset-0 opacity-40"
						aria-hidden="true"
					/>
					<div class="relative">
						<h2 class="font-display text-2xl text-balance text-white md:text-3xl">{props.title}</h2>
						{props.body && (
							<p class="mx-auto mt-3 max-w-xl text-sm text-white/75 md:text-base">{props.body}</p>
						)}
						<div class="mt-6 flex flex-wrap items-center justify-center gap-3">
							{props.children}
						</div>
						{props.note && <p class="mt-4 text-xs text-white/70">{props.note}</p>}
					</div>
				</div>
			</div>
		</section>
	)
}
