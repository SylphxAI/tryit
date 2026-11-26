/** @jsxImportSource solid-js */
import { For } from 'solid-js'
import type { Translate } from '@/lib/i18n/translate'
import type { createWordSearchPlay } from './create-word-search-play'
import type { WordSearchClientData } from './parse-client'

export function WordSearchGrid(props: {
	grid: WordSearchClientData['grid']
	play: ReturnType<typeof createWordSearchPlay>
	t: Translate
}) {
	const { grid, play, t } = props
	const rows = grid.map((_, i) => t('common.cellRow', { index: i + 1 }))
	const columns = grid.map((_, i) => t('common.cellColumn', { index: i + 1 }))
	const buttons: HTMLButtonElement[][] = grid.map(() => [])

	return (
		// Capture stays with the origin cell; never intercept taps on controls outside the board.
		<fieldset
			ref={play.setBoard}
			class="grid aspect-square w-full touch-none select-none gap-0.5 rounded-xl border border-border bg-surface-muted p-1"
			style={{ 'grid-template-columns': `repeat(${grid.length}, minmax(0, 1fr))` }}
			aria-label={t('games.wordSearch.name')}
			onPointerDown={play.startPointer}
			onPointerMove={play.movePointer}
			onPointerUp={(event) => play.release(event, true)}
			onPointerCancel={(event) => play.release(event, false)}
			onLostPointerCapture={(event) => play.release(event, false)}
		>
			<For each={grid}>
				{(line, rowIndex) => (
					<For each={line}>
						{(letter, colIndex) => {
							const row = rowIndex()
							const col = colIndex()
							const pos = { row, col }
							return (
								<button
									ref={(el) => {
										buttons[row][col] = el
									}}
									type="button"
									class="grid min-w-0 place-items-center rounded bg-background font-display text-[clamp(.6rem,3.2vw,1rem)] font-bold text-foreground focus-visible:z-10 data-found:not-data-selected:bg-emerald-500/25 data-selected:bg-accent-warm data-selected:text-on-accent"
									data-row={row}
									data-col={col}
									data-found={play.isFound(pos) || undefined}
									data-selected={play.isSelected(pos) || undefined}
									aria-label={`${letter}, ${rows[row]}, ${columns[col]}`}
									aria-pressed={play.isSelected(pos)}
									disabled={play.locked()}
									onClick={(event) => {
										if (event.detail === 0) play.select(pos)
									}}
									onKeyDown={(event) => {
										if (event.key === 'Escape') play.clearSelection()
										const next =
											event.key === 'ArrowUp'
												? buttons[row - 1]?.[col]
												: event.key === 'ArrowDown'
													? buttons[row + 1]?.[col]
													: event.key === 'ArrowLeft'
														? buttons[row][col - 1]
														: event.key === 'ArrowRight'
															? buttons[row][col + 1]
															: undefined
										if (next) {
											event.preventDefault()
											next.focus()
										}
									}}
								>
									{letter}
								</button>
							)
						}}
					</For>
				)}
			</For>
		</fieldset>
	)
}
