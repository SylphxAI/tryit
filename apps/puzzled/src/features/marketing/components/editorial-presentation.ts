import { COMPARISON_HUB_PATH } from './comparison-slugs'
import { COMPARISON_HUB, COMPARISONS, type ComparisonSpec } from './comparison-specs'

/** The page's one amber action, as on the home page. */
export const PLAY_CTA =
	'pressable inline-flex min-h-12 items-center gap-2 rounded-2xl bg-cta px-6 py-3 font-bold text-cta-foreground shadow-[inset_0_-3px_0_var(--color-cta-edge)] transition-colors hover:bg-cta-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

export const PRIMARY_CTA =
	'inline-flex min-h-12 items-center gap-2 rounded-2xl bg-primary px-6 py-3 font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-transform hover:-translate-y-0.5 hover:bg-primary-hover active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

export const SECONDARY_CTA =
	'inline-flex min-h-12 items-center gap-2 rounded-2xl border border-border bg-background/80 px-5 py-3 font-semibold backdrop-blur transition-colors hover:border-primary/30 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

export const INK_SECONDARY_CTA =
	'inline-flex min-h-12 items-center gap-2 rounded-2xl border border-white/25 bg-white/10 px-5 py-3 font-semibold text-white transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

/** The hub as a schema.org collection of the comparison pages it lists. */
export function buildComparisonHubJsonLd(origin = 'https://tryit.fun') {
	return {
		'@context': 'https://schema.org',
		'@type': 'CollectionPage',
		name: COMPARISON_HUB.metaTitle,
		description: COMPARISON_HUB.metaDescription,
		url: `${origin}${COMPARISON_HUB.path}`,
		mainEntity: {
			'@type': 'ItemList',
			itemListElement: COMPARISONS.map((spec, index) => ({
				'@type': 'ListItem',
				position: index + 1,
				name: `Tryit vs ${spec.rival}`,
				url: `${origin}${spec.path}`,
			})),
		},
	}
}

/** Home > Compare > this page, as schema.org reads a breadcrumb trail. */
export function comparisonBreadcrumbJsonLd(spec: ComparisonSpec, origin = 'https://tryit.fun') {
	const trail = [
		{ name: 'Tryit', url: origin },
		{ name: COMPARISON_HUB.eyebrow, url: `${origin}${COMPARISON_HUB_PATH}` },
		{ name: `Tryit vs ${spec.rival}`, url: `${origin}${spec.path}` },
	]
	return {
		'@type': 'BreadcrumbList',
		itemListElement: trail.map((step, index) => ({
			'@type': 'ListItem',
			position: index + 1,
			name: step.name,
			item: step.url,
		})),
	}
}
