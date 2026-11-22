/** @jsxImportSource solid-js */
import { createAsync, type RouteDefinition, useParams } from '@solidjs/router'
import { Show } from 'solid-js'
import { USE_CASE_SPECS, type UseCaseSlug } from '@/features/marketing/components/use-case-specs'
import { EditorialMeta } from '@/features/marketing/solid/editorial-meta'
import { editorialPage, editorialRoute } from '@/features/marketing/solid/editorial-route'
import { UseCaseLanding } from '@/features/marketing/solid/use-case-landing'
import { defaultLocale } from '@/lib/i18n/config'
import NotFound from '@/shared/solid/not-found'
import { SiteShell } from '@/shared/solid/site-shell'

export const route = {
	...editorialRoute,
	preload: ({ params }) =>
		editorialPage(params.locale ?? defaultLocale, `/use-cases/${params.slug}`),
} satisfies RouteDefinition

export default function Page() {
	const params = useParams()
	const spec = () =>
		params.slug && Object.hasOwn(USE_CASE_SPECS, params.slug)
			? USE_CASE_SPECS[params.slug as UseCaseSlug]
			: undefined
	const page = createAsync(
		() => editorialPage(params.locale ?? defaultLocale, `/use-cases/${params.slug}`),
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
								imageSubtitle={value.metaDescription}
								origin={base().origin}
							/>
							<SiteShell data={base().shell}>
								<UseCaseLanding spec={value} origin={base().origin} />
							</SiteShell>
						</>
					)}
				</Show>
			)}
		</Show>
	)
}
