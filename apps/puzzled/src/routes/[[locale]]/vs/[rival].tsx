/** @jsxImportSource solid-js */
import { createAsync, type RouteDefinition, useParams } from '@solidjs/router'
import { Show } from 'solid-js'
import { isComparisonSlug } from '@/features/marketing/components/comparison-slugs'
import { COMPARISON_SPECS } from '@/features/marketing/components/comparison-specs'
import { ComparisonLanding } from '@/features/marketing/solid/comparison-landing'
import { EditorialMeta } from '@/features/marketing/solid/editorial-meta'
import { editorialPage, editorialRoute } from '@/features/marketing/solid/editorial-route'
import { defaultLocale } from '@/lib/i18n/config'
import NotFound from '@/shared/solid/not-found'
import { SiteShell } from '@/shared/solid/site-shell'

export const route = {
	...editorialRoute,
	preload: ({ params }) => editorialPage(params.locale ?? defaultLocale, `/vs/${params.rival}`),
} satisfies RouteDefinition

export default function Page() {
	const params = useParams()
	const spec = () =>
		params.rival && isComparisonSlug(params.rival) ? COMPARISON_SPECS[params.rival] : undefined
	const page = createAsync(
		() => editorialPage(params.locale ?? defaultLocale, `/vs/${params.rival}`),
		{ deferStream: true },
	)
	return (
		<Show when={spec()} keyed fallback={<NotFound />}>
			{(value) => (
				<Show when={page()}>
					{(base) => (
						<>
							<EditorialMeta
								spec={value}
								imageSubtitle={value.facts.join(' · ')}
								origin={base().origin}
								type="article"
							/>
							<SiteShell data={base().shell}>
								<ComparisonLanding spec={value} origin={base().origin} />
							</SiteShell>
						</>
					)}
				</Show>
			)}
		</Show>
	)
}
