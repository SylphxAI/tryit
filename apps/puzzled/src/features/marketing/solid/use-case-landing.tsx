/** @jsxImportSource solid-js */

import { For } from 'solid-js'
import { JsonLd } from '@/shared/solid/json-ld'
import { INK_SECONDARY_CTA, PRIMARY_CTA, SECONDARY_CTA } from '../components/editorial-presentation'
import { buildUseCaseJsonLd, type UseCaseSpec } from '../components/use-case-specs'
import { ArrowRight } from './editorial-icons'
import { EditorialLink } from './editorial-link'
import { MarketingCta } from './marketing-cta'
import { MarketingFaq } from './marketing-faq'
import { MarketingHero } from './marketing-hero'
import { MarketingSection } from './marketing-section'

export function UseCaseLanding({ spec, origin }: { spec: UseCaseSpec; origin: string }) {
	const structuredData = buildUseCaseJsonLd(spec, origin)

	return (
		<main id="main-content" lang="en-US" class="flex-1 pb-16">
			<MarketingHero
				eyebrow={spec.eyebrow}
				title={spec.h1}
				lead={spec.heroSubhead}
				facts={spec.facts}
				actions={
					<>
						<EditorialLink href={spec.primaryCta.href} class={PRIMARY_CTA}>
							{spec.primaryCta.label}
							<ArrowRight class="h-4 w-4" />
						</EditorialLink>
						<EditorialLink href={spec.secondaryCta.href} class={SECONDARY_CTA}>
							{spec.secondaryCta.label}
						</EditorialLink>
					</>
				}
			/>

			<MarketingSection
				id="how-it-works"
				title={spec.workflowTitle}
				subtitle={spec.workflowSubtitle}
				flush
			>
				<ol class="grid gap-4 lg:grid-cols-3">
					<For each={spec.workflows}>
						{(step, index) => (
							<li class="surface-card flex flex-col p-6">
								<span class="eyebrow">Step {index() + 1}</span>
								<h3 class="mt-2 font-display text-lg text-balance">{step.title}</h3>
								<p class="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
								{step.groups && (
									<ul class="mt-3 space-y-1.5 text-sm leading-relaxed text-muted-foreground">
										<For each={step.groups}>
											{(group) => (
												<li>
													<strong class="font-semibold text-foreground">{group.heading}:</strong>{' '}
													{group.games}
												</li>
											)}
										</For>
									</ul>
								)}
							</li>
						)}
					</For>
				</ol>
			</MarketingSection>

			<MarketingSection
				id="comparison"
				title={spec.comparisonTitle}
				subtitle={spec.comparisonSubtitle}
			>
				<div class="surface-card overflow-x-auto">
					<table class="w-full min-w-[640px] border-collapse text-left text-sm">
						<caption class="sr-only">{spec.comparisonTitle}</caption>
						<thead>
							<tr class="border-b border-border bg-muted/40">
								<For each={spec.comparisonHeaders}>
									{(header) => (
										<th scope="col" class="px-4 py-3.5 font-display text-sm font-semibold">
											{header}
										</th>
									)}
								</For>
							</tr>
						</thead>
						<tbody>
							<For each={spec.comparisonRows}>
								{(row) => (
									<tr class="border-b border-border last:border-b-0">
										<th scope="row" class="px-4 py-3.5 font-semibold text-foreground align-top">
											{row.feature}
										</th>
										<td class="px-4 py-3.5 text-muted-foreground align-top">{row.columns[0]}</td>
										<td class="px-4 py-3.5 text-muted-foreground align-top">{row.columns[1]}</td>
										<td class="px-4 py-3.5 font-medium text-foreground align-top">
											{row.columns[2]}
										</td>
									</tr>
								)}
							</For>
						</tbody>
					</table>
				</div>
			</MarketingSection>

			<MarketingFaq id="faq" title={spec.faqTitle} items={spec.faqs} emitStructuredData={false} />

			<MarketingCta
				title={spec.closingCta.title}
				body={spec.closingCta.body}
				note={spec.closingCta.note}
			>
				<EditorialLink href={spec.primaryCta.href} class={PRIMARY_CTA}>
					{spec.primaryCta.label}
					<ArrowRight class="h-4 w-4" />
				</EditorialLink>
				<EditorialLink href={spec.secondaryCta.href} class={INK_SECONDARY_CTA}>
					{spec.secondaryCta.label}
				</EditorialLink>
			</MarketingCta>

			<JsonLd value={structuredData} />
		</main>
	)
}
