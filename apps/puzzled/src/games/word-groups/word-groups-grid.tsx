/** @jsxImportSource solid-js */
import { For, Show } from 'solid-js'
import type { WordGroupsPlay } from './create-word-groups-play'

export function WordGroupsGrid({
	play,
}: {
	play: Pick<WordGroupsPlay, 'remaining' | 'selected' | 'shuffleRound' | 'toggle'>
}) {
	return (
		<Show when={play.shuffleRound() + 1} keyed>
			{(round) => (
				<div class="word-grid grid w-full grid-cols-4">
					<For each={play.remaining()}>
						{(word, index) => {
							const longest = Math.max(6, ...word.split(/\s+/).map((part) => part.length))
							const active = () => play.selected().includes(word)
							return (
								<button
									type="button"
									class="word-tile"
									classList={{ 'animate-shuffle-tile': round > 1 }}
									aria-pressed={active()}
									data-selected={active() ? 'true' : undefined}
									style={{
										'--word-len': longest,
										'--word-tracking': longest >= 9 ? '-0.01em' : undefined,
										'animation-delay': round > 1 ? `${index() * 20}ms` : undefined,
									}}
									onClick={() => play.toggle(word)}
								>
									<span class="word-tile-label">{word}</span>
								</button>
							)
						}}
					</For>
				</div>
			)}
		</Show>
	)
}
