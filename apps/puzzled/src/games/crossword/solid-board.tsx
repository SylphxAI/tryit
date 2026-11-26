/** @jsxImportSource solid-js */
import { createMemo, Show } from 'solid-js'
import { BoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { createTranslator } from '@/lib/i18n/translate'
import { createCrosswordPlay } from './create-crossword-play'
import { CrosswordClueBanner, CrosswordClueList } from './crossword-clues'
import { CrosswordEntry } from './crossword-entry'
import { CrosswordGrid } from './crossword-grid'
import { parseCrosswordClientPayload } from './parse-client'
import type { CrosswordDirection, CrosswordPuzzleClientData } from './types'

export default function CrosswordBoard(props: DailyBoardProps) {
	const t = createTranslator(props.locale)
	const puzzle = createMemo(() => {
		try {
			return parseCrosswordClientPayload(props.puzzle.puzzleData)
		} catch {
			return null
		}
	})
	return (
		<Show when={puzzle()} keyed fallback={<p role="alert">{t('daily.unavailableTitle')}</p>}>
			{(data) => <Crossword {...props} data={data} />}
		</Show>
	)
}

function Crossword(props: DailyBoardProps & { data: CrosswordPuzzleClientData }) {
	const t = createTranslator(props.locale)
	const data = props.data
	const play = createCrosswordPlay(props)
	const { acrossOnly, filled, total, state, playing, finish } = play
	const directionName = (direction: CrosswordDirection) =>
		t(direction === 'across' ? 'games.crossword.across' : 'games.crossword.down')

	return (
		<div
			class="play-split mx-auto flex w-full max-w-md flex-col gap-2 md:gap-4"
			data-crossword-board
		>
			<div class="play-meta hidden flex-wrap items-center justify-between gap-x-3 pb-1 text-sm font-semibold text-muted-foreground sm:flex">
				<Show when={!acrossOnly} fallback={<span>{t('games.crossword.acrossOnly')}</span>}>
					<span class="tabular-nums" dir="ltr">
						{filled()} / {total}
					</span>
					<span>{directionName(state().direction)}</span>
				</Show>
			</div>
			<CrosswordGrid data={data} play={play} t={t} />
			<div class="play-tools flex flex-col gap-2">
				<CrosswordClueBanner clues={data.clues} play={play} t={t} directionName={directionName} />
				<Show when={playing() || finish.state() === 'pending'}>
					<CrosswordEntry play={play} t={t} />
				</Show>
				<BoardFinish
					finish={finish}
					locale={props.locale}
					message={t('games.crossword.complete')}
					shareTitle={t('games.crossword.name')}
				/>
				<CrosswordClueList clues={data.clues} play={play} t={t} directionName={directionName} />
			</div>
		</div>
	)
}
