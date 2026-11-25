/** @jsxImportSource solid-js */
import { createMemo, For, Show } from 'solid-js'
import type { Translate } from '@/lib/i18n/translate'
import type { SpellingBeeState } from './types'

export function FoundWords(props: { state: SpellingBeeState; t: Translate }) {
	const sortedWords = createMemo(() => [...props.state.foundWords].sort())
	return (
		<details class="group rounded-xl border border-border bg-surface">
			<summary class="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3 text-sm font-semibold">
				<span>{props.t('games.wordHive.foundWords')}</span>
				<span class="flex items-center gap-2.5 text-muted-foreground tabular-nums">
					<span>
						{props.state.foundWords.length}
						{props.state.totalWords > 0 ? `/${props.state.totalWords}` : ''}
					</span>
					<span
						aria-hidden="true"
						class="mr-0.5 mb-1 size-2 rotate-45 border-r-2 border-b-2 group-open:mt-1 group-open:mb-0 group-open:rotate-225"
					/>
				</span>
			</summary>
			<Show
				when={sortedWords().length > 0}
				fallback={
					<p class="px-3 pb-3 text-sm text-muted-foreground">{props.t('games.wordHive.noWords')}</p>
				}
			>
				<ul class="flex flex-wrap gap-1.5 border-t border-border p-3">
					<For each={sortedWords()}>
						{(word) => (
							<li class="max-w-full rounded-md bg-muted px-2 py-1 text-sm font-semibold wrap-anywhere">
								<Show when={props.state.foundPangrams.includes(word)}>
									<span aria-hidden="true" class="text-accent-warm-foreground">
										✦{' '}
									</span>
									<span class="sr-only">{props.t('games.wordHive.pangram')}: </span>
								</Show>
								<span lang="en">{word}</span>
							</li>
						)}
					</For>
				</ul>
			</Show>
		</details>
	)
}
