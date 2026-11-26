/** @jsxImportSource solid-js */
import { For, Show } from 'solid-js'
import type { Translate } from '@/lib/i18n/translate'
import { inClue } from './board-state'
import { type CrosswordPlay, cellBit, cellToken } from './create-crossword-play'
import styles from './crossword.module.css'
import type { CrosswordPuzzleClientData } from './types'

export function CrosswordGrid(props: {
	data: CrosswordPuzzleClientData
	play: Pick<
		CrosswordPlay,
		'state' | 'playing' | 'activeClue' | 'wrongCells' | 'registerCell' | 'selectCell'
	>
	t: Translate
}) {
	const { state, playing, activeClue, wrongCells, registerCell, selectCell } = props.play
	const { data, t } = props
	const numbers = new Map(
		[...data.clues.across, ...data.clues.down].map((clue) => [
			cellToken(clue.row, clue.col),
			clue.number,
		]),
	)
	return (
		<fieldset
			class="play-board mx-auto grid w-full max-w-64 grid-cols-5 gap-1 rounded-xl border-2 border-foreground/85 bg-border p-1 shadow-sm md:max-w-xs dark:border-foreground/60"
			aria-label={t('games.crossword.name')}
			dir="ltr"
		>
			<For each={data.grid}>
				{(row, r) => (
					<For each={row}>
						{(cell, c) => {
							if (cell === null)
								return (
									<span
										class="aspect-square rounded-sm border border-border bg-ink"
										aria-hidden="true"
									/>
								)
							const selected = () =>
								state().selectedCell?.row === r() && state().selectedCell?.col === c()
							const number = numbers.get(cellToken(r(), c()))
							const letter = () => state().userGrid[r()][c()]
							const highlighted = () => {
								const clue = activeClue()
								return clue && inClue(clue, r(), c(), state().direction)
							}
							return (
								<button
									ref={(node) => registerCell(r(), c(), node)}
									type="button"
									tabindex={selected() ? 0 : -1}
									disabled={!playing()}
									aria-pressed={selected()}
									aria-label={[
										t('common.cellRow', { index: r() + 1 }),
										t('common.cellColumn', { index: c() + 1 }),
										letter(),
									]
										.filter(Boolean)
										.join(', ')}
									class={`relative grid aspect-square place-items-center rounded-sm bg-card font-display text-xl font-bold text-foreground data-word:bg-accent-warm-soft aria-pressed:bg-accent-warm aria-pressed:text-on-accent focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-info ${styles.cell}`}
									data-word={(!selected() && highlighted()) || undefined}
									aria-invalid={Boolean(wrongCells() & cellBit(r(), c())) || undefined}
									data-crossword-cell={cellToken(r(), c())}
									onClick={() => selectCell(r(), c())}
								>
									<Show when={number}>
										<span
											aria-hidden="true"
											class="absolute top-1 left-1.5 font-sans text-[0.625rem] leading-none tabular-nums"
										>
											{number}
										</span>
									</Show>
									{letter()}
								</button>
							)
						}}
					</For>
				)}
			</For>
		</fieldset>
	)
}
