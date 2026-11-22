/** @jsxImportSource solid-js */
import { createAsync, useParams } from '@solidjs/router'
import { Show } from 'solid-js'
import { isComparisonSlug } from '@/features/marketing/components/comparison-slugs'
import { COMPARISON_SPECS } from '@/features/marketing/components/comparison-specs'
import { ComparisonLanding } from '@/features/marketing/solid/comparison-landing'
import { EditorialMeta } from '@/features/marketing/solid/editorial-meta'
import { editorialOrigin, editorialRoute } from '@/features/marketing/solid/editorial-route'
import NotFound from '@/shared/solid/not-found'

export const route = editorialRoute

export default function Page() {
	const params = useParams()
	const spec = () =>
		params.rival && isComparisonSlug(params.rival) ? COMPARISON_SPECS[params.rival] : undefined
	const origin = createAsync(() => editorialOrigin(), { deferStream: true })
	return (
		<Show when={spec()} keyed fallback={<NotFound />}>
			{(value) => (
				<Show when={origin()}>
					{(base) => (
						<>
							<EditorialMeta
								spec={value}
								imageSubtitle={value.facts.join(' · ')}
								origin={base()}
								type="article"
							/>
							<ComparisonLanding spec={value} origin={base()} />
						</>
					)}
				</Show>
			)}
		</Show>
	)
}
