/** @jsxImportSource solid-js */
import { createMemo, createSignal, onMount, Show } from 'solid-js'
import { BoardFinish, createBoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { createTranslator } from '@/lib/i18n/translate'
import { createKillerSudokuPlay } from './create-killer-sudoku-play'
import { firstMoveCage, openFirstMoveCue } from './first-move'
import { FirstMoveCue } from './first-move-cue'
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
	const [cue, setCue] = createSignal(false)
	const dismiss = () => setCue(false)
	const play = createKillerSudokuPlay(props.data, finish, { visible: cue, dismiss })
	const target = createMemo(() => {
		if (!cue() || !play.playing()) return
		const { cells } = play.state()
		return firstMoveCage(
			props.data.cages,
			(row, col) => !cells[row][col].isGiven && cells[row][col].value === null,
		)
	})
	onMount(() => {
		// Completed daily snapshots already render a result instead of this board.
		setCue(
			openFirstMoveCue((props.mode ?? 'daily') === 'daily' && play.playing(), () => localStorage),
		)
	})
	return (
		<div
			class="play-split sudoku-layout mx-auto flex w-full max-w-[26rem] flex-col"
			data-killer-sudoku-board
		>
			<KillerSudokuGrid cages={props.data.cages} cueCage={target()} play={play} t={t} />
			<Show when={cue()}>
				<FirstMoveCue t={t} dismiss={dismiss} visible={play.playing()} />
			</Show>
			<KillerSudokuControls play={play} t={t} />
			<BoardFinish
				finish={finish}
				locale={props.locale}
				message={t('games.killerSudoku.complete')}
			/>
		</div>
	)
}
