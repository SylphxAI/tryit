/** @jsxImportSource solid-js */
import { createMemo, For, Show } from 'solid-js'
import styles from '@/games/sudoku/components/sudoku-craft.module.css'
import type { Translate } from '@/lib/i18n/translate'
import type { KillerSudokuPlay } from './create-killer-sudoku-play'
import { cageAnchor } from './first-move'
import cageStyles from './solid-cages.module.css'
import { type Cage, getCellConflicts } from './types'

const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const coords = [0, 1, 2]
const boxes = coords.flatMap((br) => coords.map((bc) => ({ br, bc })))

type GridProps = {
	cages: Cage[]
	cueCage?: number
	play: Pick<KillerSudokuPlay, 'initial' | 'state' | 'playing' | 'registerCell' | 'dispatch'>
	t: Translate
}

export function KillerSudokuGrid(props: GridProps) {
	const { cages, play, t } = props
	const { initial, state, playing, registerCell, dispatch } = play
	const anchors = cages.map(cageAnchor)

	const selection = () => state().selectedCell
	const selectedCell = createMemo(() => {
		const pos = selection()
		return pos ? state().cells[pos[0]][pos[1]] : undefined
	})

	const cellAt = (row: number, col: number) => {
		const cell = () => state().cells[row][col]
		const selected = () => selection()?.[0] === row && selection()?.[1] === col
		const conflict = createMemo(() => getCellConflicts(state().cells, cages, row, col).size > 0)
		const { cageId } = initial.cells[row][col]
		const cage = cages[cageId]
		const related = () => {
			const pos = selection()
			if (!pos || selected()) return false
			const [r, c] = pos
			return (
				r === row ||
				c === col ||
				(Math.floor(r / 3) === Math.floor(row / 3) && Math.floor(c / 3) === Math.floor(col / 3)) ||
				selectedCell()?.cageId === cageId
			)
		}
		const matching = () =>
			!selected() && cell().value !== null && cell().value === selectedCell()?.value
		const showTotal = anchors[cageId] === row * 9 + col
		return (
			<button
				type="button"
				ref={(element) => registerCell(row, col, element)}
				class={styles.cell}
				classList={{ [cageStyles.cell]: true, [cageStyles.hasTotal]: showTotal }}
				onFocus={() => dispatch({ type: 'SELECT_CELL', row, col })}
				onClick={() => dispatch({ type: 'SELECT_CELL', row, col })}
				aria-pressed={selected()}
				aria-invalid={conflict() || undefined}
				disabled={!playing()}
				aria-label={[
					t('common.cellRow', { index: row + 1 }),
					t('common.cellColumn', { index: col + 1 }),
					cell().value,
					t('games.killerSudoku.cageTotal', { sum: cage.sum }),
					cell().notes.size > 0 &&
						t('games.killerSudoku.notes') +
							': ' +
							digits.filter((n) => cell().notes.has(n)).join(', '),
				]
					.filter(Boolean)
					.join(', ')}
				data-selected={selected() || undefined}
				data-related={related() || undefined}
				data-matching={matching() || undefined}
				data-cage-cue={props.cueCage === cageId || undefined}
				data-given={cell().isGiven || undefined}
				data-filled={cell().value !== null || undefined}
				data-conflict={conflict() || undefined}
			>
				<span
					aria-hidden="true"
					class={cageStyles.edge}
					data-top={initial.cells[row - 1]?.[col]?.cageId !== cageId || undefined}
					data-right={initial.cells[row][col + 1]?.cageId !== cageId || undefined}
					data-bottom={initial.cells[row + 1]?.[col]?.cageId !== cageId || undefined}
					data-left={initial.cells[row][col - 1]?.cageId !== cageId || undefined}
				/>
				<Show when={showTotal}>
					<span class={cageStyles.total} data-cage-total aria-hidden="true">
						{cage.sum}
					</span>
				</Show>
				<Show when={cell().value}>
					<span class={`${styles.value} ${cageStyles.digit}`}>{cell().value}</span>
				</Show>
				<Show when={cell().notes.size}>
					<span class={`${styles.notes} ${cageStyles.notes}`} aria-hidden="true">
						<For each={digits}>
							{(digit) => (
								<span class={styles.note} data-visible={cell().notes.has(digit) || undefined}>
									{digit}
								</span>
							)}
						</For>
					</span>
				</Show>
				<Show when={conflict()}>
					<span class={styles.conflictMark} aria-hidden="true">
						!
					</span>
				</Show>
			</button>
		)
	}
	return (
		<div class={`play-board ${styles.board}`}>
			{/* biome-ignore lint/a11y/useSemanticElements: the visual grid is a named group of game controls */}
			<div class={styles.boxes} role="group" aria-label={t('games.killerSudoku.name')}>
				<For each={boxes}>
					{({ br, bc }) => (
						<div class={styles.box}>
							{coords.flatMap((r) => coords.map((c) => cellAt(br * 3 + r, bc * 3 + c)))}
						</div>
					)}
				</For>
			</div>
		</div>
	)
}
