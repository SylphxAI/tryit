/** @jsxImportSource solid-js */
import { createAsync } from '@solidjs/router'
import { Show } from 'solid-js'
import { COMPARISON_HUB } from '@/features/marketing/components/comparison-specs'
import { ComparisonHub } from '@/features/marketing/solid/comparison-hub'
import { EditorialMeta } from '@/features/marketing/solid/editorial-meta'
import { editorialOrigin, editorialRoute } from '@/features/marketing/solid/editorial-route'

export const route = editorialRoute

export default function Page() {
	const origin = createAsync(() => editorialOrigin(), { deferStream: true })
	return (
		<Show when={origin()}>
			{(base) => (
				<>
					<EditorialMeta
						spec={COMPARISON_HUB}
						imageSubtitle={COMPARISON_HUB.facts.join(' · ')}
						origin={base()}
					/>
					<ComparisonHub origin={base()} />
				</>
			)}
		</Show>
	)
}
