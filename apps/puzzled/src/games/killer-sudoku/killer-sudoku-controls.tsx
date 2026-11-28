/** @jsxImportSource solid-js */
import { Delete, PencilLine, RotateCcw, Undo2 } from 'lucide-solid'
import { For, Show } from 'solid-js'
import styles from '@/games/sudoku/components/sudoku-craft.module.css'
import type { Translate } from '@/lib/i18n/translate'
import type { KillerSudokuPlay } from './create-killer-sudoku-play'

const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9]

type ControlsProps = {
	play: Pick<
		KillerSudokuPlay,
		'state' | 'feedback' | 'conflict' | 'playing' | 'canUndo' | 'dispatch' | 'undo'
	>
	statusId: string
	t: Translate
}

export function KillerSudokuControls({ play, statusId, t }: ControlsProps) {
	const { state, feedback, conflict, playing, canUndo, dispatch, undo } = play
	return (
		<div class="play-tools" data-play-control>
			<p id={statusId} role="status" class="min-h-5 text-center text-sm">
				{feedback() ? t(`games.killerSudoku.messages.${feedback()}`) : ''}
				<Show when={conflict()} keyed>
					{({ rule, sum }) => (
						<span class="block text-destructive">
							{t(`games.killerSudoku.messages.${rule === 'cage_sum' ? 'wrongSum' : rule}`, { sum })}{' '}
							{t(`games.killerSudoku.messages.${canUndo() ? 'undoOrChange' : 'changeEntry'}`)}
						</span>
					)}
				</Show>
			</p>
			<div class={styles.pad}>
				<div class={styles.digits}>
					<For each={digits}>
						{(digit) => (
							<button
								type="button"
								class={styles.key}
								disabled={!playing()}
								data-notes={state().notesMode || undefined}
								onClick={() => dispatch({ type: 'SET_VALUE', value: digit })}
							>
								{digit}
							</button>
						)}
					</For>
					<button
						type="button"
						class={`${styles.key} ${styles.erase}`}
						disabled={!playing()}
						aria-label={t('games.sudoku.clear')}
						onClick={() => dispatch({ type: 'CLEAR_CELL' })}
					>
						<Delete size={20} aria-hidden="true" />
					</button>
				</div>
				<div class={styles.tools}>
					<button
						type="button"
						class={[styles.key, styles.tool].join(' ')}
						disabled={!canUndo()}
						onClick={undo}
					>
						<Undo2 size={16} aria-hidden="true" />
						{t('games.sudoku.undo')}
					</button>
					<button
						type="button"
						class={`${styles.key} ${styles.tool}`}
						aria-pressed={state().notesMode}
						disabled={!playing()}
						onClick={() => dispatch({ type: 'TOGGLE_NOTES_MODE' })}
					>
						<PencilLine size={16} aria-hidden="true" />
						{t('games.killerSudoku.notes')}
					</button>
					<button
						type="button"
						class={`${styles.key} ${styles.tool}`}
						disabled={!playing()}
						onClick={() => dispatch({ type: 'RESET' })}
					>
						<RotateCcw size={16} aria-hidden="true" />
						{t('games.killerSudoku.startOver')}
					</button>
				</div>
			</div>
		</div>
	)
}
