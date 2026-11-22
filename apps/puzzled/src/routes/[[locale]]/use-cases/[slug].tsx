/** @jsxImportSource solid-js */
import { createAsync, useParams } from '@solidjs/router'
import { Show } from 'solid-js'
import { USE_CASE_SPECS, type UseCaseSlug } from '@/features/marketing/components/use-case-specs'
import { EditorialMeta } from '@/features/marketing/solid/editorial-meta'
import { editorialOrigin, editorialRoute } from '@/features/marketing/solid/editorial-route'
import { UseCaseLanding } from '@/features/marketing/solid/use-case-landing'
import NotFound from '@/shared/solid/not-found'

export const route = editorialRoute

export default function Page() {
	const params = useParams()
	const spec = () =>
		params.slug && Object.hasOwn(USE_CASE_SPECS, params.slug)
			? USE_CASE_SPECS[params.slug as UseCaseSlug]
			: undefined
	const origin = createAsync(() => editorialOrigin(), { deferStream: true })
	return (
		<Show when={spec()} keyed fallback={<NotFound />}>
			{(value) => (
				<Show when={origin()}>
					{(base) => (
						<>
							<EditorialMeta spec={value} imageSubtitle={value.metaDescription} origin={base()} />
							<UseCaseLanding spec={value} origin={base()} />
						</>
					)}
				</Show>
			)}
		</Show>
	)
}
