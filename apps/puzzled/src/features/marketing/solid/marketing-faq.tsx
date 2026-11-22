/** @jsxImportSource solid-js */

import { For } from 'solid-js'
import { cn } from '@/lib/utils'
import { JsonLd } from '@/shared/solid/json-ld'
import type { MarketingFaqItem } from '../components/marketing-faq'
import { ChevronDown } from './editorial-icons'
import { EditorialLink } from './editorial-link'

type MarketingFaqProps = {
	id: string
	items: readonly MarketingFaqItem[]
	/** Section heading; omit when the FAQ sits under an existing heading. */
	title?: string
	subtitle?: string
	/** Two columns on desktop for short answers; one column for long prose. */
	columns?: 1 | 2
	/** Emit a standalone FAQPage script tag; disable when composed into an @graph block. */
	emitStructuredData?: boolean
	class?: string
}

/**
 * Accessible FAQ list.
 *
 * Native `<details>`/`<summary>` keeps answers in the served HTML (crawlers
 * and no-JS readers see them), gives keyboard operation for free, and the same
 * copy feeds the FAQPage structured data so the two can never drift. The
 * chevron is decorative: the open state is conveyed by the native disclosure,
 * never by colour alone. The 44px summary target and the focus ring are part
 * of the component so no caller can drop them.
 *
 * Every FAQ on the site renders through this component: it is the one home for
 * the disclosure behaviour and the structured data, so a page cannot ship an
 * FAQ with a different target size or a missing JSON-LD block.
 */
export function MarketingFaq({
	id,
	title,
	subtitle,
	items,
	columns = 2,
	emitStructuredData = true,
	class: className,
}: MarketingFaqProps) {
	const headingId = `${id}-heading`
	const structuredData = {
		'@context': 'https://schema.org',
		'@type': 'FAQPage',
		mainEntity: items.map((item) => ({
			'@type': 'Question',
			name: item.question,
			acceptedAnswer: {
				'@type': 'Answer',
				text: item.answerLink ? `${item.answer} ${item.answerLink.label}` : item.answer,
			},
		})),
	}

	return (
		<section
			id={id}
			aria-labelledby={title ? headingId : undefined}
			// scroll-mt keeps an in-page anchor clear of the sticky h-16 shell header.
			class={cn('section-block scroll-mt-24', className)}
		>
			<div class="page-shell-wide">
				{title && (
					<h2
						id={headingId}
						class="font-display text-[1.625rem] leading-tight text-balance md:text-3xl"
					>
						{title}
					</h2>
				)}
				{subtitle && <p class="mt-2 max-w-2xl leading-relaxed text-muted-foreground">{subtitle}</p>}
				<div
					class={cn(
						'grid border-t border-border',
						(title || subtitle) && 'mt-5',
						columns === 2 && 'md:grid-cols-2 md:gap-x-10',
					)}
				>
					<For each={items}>
						{(item) => (
							<details class="group border-b border-border">
								<summary class="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3.5 text-[15px] font-semibold marker:content-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
									{item.question}
									<ChevronDown class="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-medium ease-out group-open:rotate-180" />
								</summary>
								<p class="pb-4 pr-8 text-[15px] leading-relaxed text-muted-foreground">
									{item.answer}
									{item.answerLink && (
										<>
											{' '}
											<EditorialLink
												href={item.answerLink.href}
												class="font-semibold underline underline-offset-4"
											>
												{item.answerLink.label}
											</EditorialLink>
										</>
									)}
								</p>
							</details>
						)}
					</For>
				</div>
			</div>

			{emitStructuredData && <JsonLd value={structuredData} />}
		</section>
	)
}
