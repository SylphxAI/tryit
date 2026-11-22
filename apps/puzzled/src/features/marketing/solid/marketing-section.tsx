/** @jsxImportSource solid-js */
import type { JSX } from 'solid-js'
import { cn } from '@/lib/utils'

type MarketingSectionProps = {
	/** Anchor id; also names the section heading for assistive tech. */
	id: string
	title?: string
	subtitle?: string
	children: JSX.Element
	/** Removes the top padding for sections that follow a hero directly. */
	flush?: boolean
	class?: string
	/** Optional trailing action (e.g. a link to the catalog). */
	action?: JSX.Element
}

/**
 * One marketing section: heading, optional lead sentence, then content.
 *
 * Keeps the vertical rhythm and the heading level consistent across pricing,
 * support and legal surfaces.
 */
export function MarketingSection(props: MarketingSectionProps) {
	const headingId = `${props.id}-heading`

	return (
		<section
			id={props.id}
			aria-labelledby={props.title ? headingId : undefined}
			// scroll-mt keeps an in-page anchor clear of the sticky h-16 shell header.
			class={cn('section-block scroll-mt-24', props.flush && 'pt-0', props.class)}
		>
			<div class="page-shell-wide">
				{(props.title || props.action) && (
					<div class="flex flex-wrap items-end justify-between gap-4">
						<div>
							{props.title && (
								<h2 id={headingId} class="font-display text-2xl text-balance md:text-3xl">
									{props.title}
								</h2>
							)}
							{props.subtitle && (
								<p class="mt-2 max-w-2xl leading-relaxed text-muted-foreground">{props.subtitle}</p>
							)}
						</div>
						{props.action}
					</div>
				)}
				<div class={props.title || props.action ? 'mt-6' : undefined}>{props.children}</div>
			</div>
		</section>
	)
}
