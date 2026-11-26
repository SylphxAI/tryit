/** @jsxImportSource solid-js */
import { createMemo, For, Show } from 'solid-js'
import { BoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { createTranslator } from '@/lib/i18n/translate'
import { createWordGroupsPlay } from './create-word-groups-play'
import { parseWordGroupsClientPayload } from './parse-client'
import { CATEGORY_COLORS } from './types'
import { WordGroupsControls } from './word-groups-controls'

export default function GroupsBoard(props: DailyBoardProps) {
	const t = createTranslator(props.locale)
	const puzzle = createMemo(() => {
		try {
			const words = parseWordGroupsClientPayload(props.puzzle.puzzleData)
			return new Set(words).size === words.length ? words : undefined
		} catch {
			return undefined
		}
	})
	return (
		<Show when={puzzle()} keyed fallback={<p role="alert">{t('daily.unavailableTitle')}</p>}>
			{(words) => <Board {...props} words={words} />}
		</Show>
	)
}

function Board(props: DailyBoardProps & { words: string[] }) {
	const t = createTranslator(props.locale)
	const play = createWordGroupsPlay(props)

	return (
		<div class="mx-auto w-full max-w-md space-y-3 text-center">
			<div class="flex items-center justify-between gap-2 text-sm">
				<span class="text-muted-foreground">{t('games.wordGroups.tagline')}</span>
			</div>
			<For each={play.categories()}>
				{(category) => (
					<div
						data-group-category
						class={[
							'rounded-xl px-2 py-3',
							CATEGORY_COLORS[category.level].bg,
							CATEGORY_COLORS[category.level].text,
						].join(' ')}
					>
						<h3 class="font-display text-base font-bold uppercase">{category.name}</h3>
						<p class="text-sm">{category.words.join(', ')}</p>
					</div>
				)}
			</For>
			<Show when={play.playing()}>
				<WordGroupsControls play={play} t={t} />
			</Show>
			<BoardFinish
				finish={play.finish}
				locale={props.locale}
				message={
					play.left() ? t('gameResult.congratulations') : t('games.wordGroups.messages.gameOver')
				}
			/>
		</div>
	)
}
