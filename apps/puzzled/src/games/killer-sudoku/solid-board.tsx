/** @jsxImportSource solid-js */
import { createMemo, Show } from 'solid-js'
import { BoardFinish, createBoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { createTranslator } from '@/lib/i18n/translate'
import { createKillerSudokuPlay } from './create-killer-sudoku-play'
import { KillerSudokuControls } from './killer-sudoku-controls'
import { KillerSudokuGrid } from './killer-sudoku-grid'
import { parseKillerSudokuClientPayload } from './parse-client'
import type { KillerSudokuPuzzleData } from './types'

export default function KillerSudokuBoard(props: DailyBoardProps) {
	const t = createTranslator(props.locale)
	const puzzle = createMemo(() => {
		try {
			return parseKillerSudokuClientPayload(props.puzzle.puzzleData)
		} catch {
			return null
		}
	})
	return (
		<Show when={puzzle()} keyed fallback={<p role="alert">{t('daily.unavailableTitle')}</p>}>
			{(data) => <Board data={data} {...props} />}
		</Show>
	)
}

function Board(props: DailyBoardProps & { data: KillerSudokuPuzzleData }) {
	const t = createTranslator(props.locale)
	const finish = createBoardFinish(props, 'killer-sudoku')
	const play = createKillerSudokuPlay(props.data, finish)
	return (
		<div
			class="play-split sudoku-layout mx-auto flex w-full max-w-[26rem] flex-col gap-3"
			data-killer-sudoku-board
		>
			<KillerSudokuGrid cages={props.data.cages} play={play} t={t} />
			<KillerSudokuControls play={play} t={t} />
			<BoardFinish
				finish={finish}
				locale={props.locale}
				message={t('games.killerSudoku.complete')}
			/>
		</div>
	)
}
