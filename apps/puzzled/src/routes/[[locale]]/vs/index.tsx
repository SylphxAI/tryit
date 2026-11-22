/** @jsxImportSource solid-js */
import { createAsync, type RouteDefinition, useParams } from '@solidjs/router'
import { Show } from 'solid-js'
import { COMPARISON_HUB } from '@/features/marketing/components/comparison-specs'
import { ComparisonHub } from '@/features/marketing/solid/comparison-hub'
import { EditorialMeta } from '@/features/marketing/solid/editorial-meta'
import { editorialPage, editorialRoute } from '@/features/marketing/solid/editorial-route'
import { defaultLocale } from '@/lib/i18n/config'
import { SiteShell } from '@/shared/solid/site-shell'

export const route = {
	...editorialRoute,
	preload: ({ params }) => editorialPage(params.locale ?? defaultLocale, '/vs'),
} satisfies RouteDefinition

export default function Page() {
	const params = useParams()
	const page = createAsync(() => editorialPage(params.locale ?? defaultLocale, '/vs'), {
		deferStream: true,
	})
	return (
		<Show when={page()}>
			{(base) => (
				<>
					<EditorialMeta
						spec={COMPARISON_HUB}
						imageSubtitle={COMPARISON_HUB.facts.join(' · ')}
						origin={base().origin}
						locale={base().shell.language}
					/>
					<SiteShell data={base().shell}>
						<ComparisonHub origin={base().origin} />
					</SiteShell>
				</>
			)}
		</Show>
	)
}
