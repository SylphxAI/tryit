/** @jsxImportSource solid-js */
import { Delete } from 'lucide-solid'
import { createMemo, For, Show } from 'solid-js'
import type { Translate } from '@/lib/i18n/translate'
import { boardLetterStatuses, gradeCodes, liveBoards, sharedStatus, UNTRIED } from './board-letters'
import { BOARD_INDICES, type LetterStatus, type QuordleGameState } from './types'

const keys = [
	'QWERTYUIOP'.split(''),
	'ASDFGHJKL'.split(''),
	['Enter', ...'ZXCVBNM'.split(''), 'Backspace'],
]
/* One key corner per board, laid out like the boards. The marks repeat the tile
   language so no state rests on colour alone: correct carries a solid ink bar
   on its outer edge, present a dotted one. A solved board's corners fade. */
const bar = 'after:absolute after:inset-x-1 after:border-t-2 after:border-[#1a1712]'
const corners: Record<LetterStatus, string> = {
	correct: `bg-correct ${bar}`,
	present: `bg-present ${bar} after:border-dotted`,
	absent: 'bg-absent',
	empty: 'bg-muted',
}
const cornerBars = ['after:top-1', 'after:top-1', 'after:bottom-1', 'after:bottom-1']

type QuadKeyboardProps = {
	state: QuordleGameState
	t: Translate
	boardName: (index: number) => string
	feedback: (status: LetterStatus | undefined) => string | undefined
	onPress: (key: string) => void
}

export function QuadKeyboard(props: QuadKeyboardProps) {
	const letterStatuses = createMemo(() => boardLetterStatuses(props.state.boards))

	return (
		<Show when={props.state.gameStatus === 'playing'}>
			<div
				class="play-tools mx-auto grid w-full max-w-md gap-1 pt-1.5 sm:pt-0"
				data-play-control
				aria-busy={props.state.grading}
				dir="ltr"
			>
				<For each={keys}>
					{(row) => (
						<div class="flex justify-center gap-0.5 sm:gap-1">
							<For each={row}>
								{(key) => {
									const letter = key.length === 1
									const label =
										key === 'Backspace'
											? props.t('games.wordGuess.keyboard.delete')
											: key === 'Enter'
												? props.t('games.wordGuess.keyboard.enter')
												: key
									const status = () => props.state.keyboardStatus.get(key)
									const grades = () => letterStatuses().get(key) ?? UNTRIED
									const graded = () => sharedStatus(grades()) !== 'empty'
									const live = () => liveBoards(grades())
									const solved = (index: number) => props.state.boards[index]?.solved ?? false
									/* Nothing left to learn from this letter on the boards still open. */
									const spent = () => graded() && live().every(solved)
									/* "C, Board 2 wrong position, Board 3 correct": only the boards the letter
									   is still in, and one phrase when every board agrees. */
									const name = () => {
										if (!graded()) return label
										const shared = live().length ? sharedStatus(grades()) : 'absent'
										if (shared) return `${label}, ${props.feedback(shared)}`
										return [
											label,
											...live().map(
												(index) => `${props.boardName(index)} ${props.feedback(grades()[index])}`,
											),
										].join(', ')
									}
									return (
										<button
											type="button"
											onClick={() => props.onPress(key)}
											aria-disabled={props.state.grading}
											aria-label={letter ? name() : label}
											data-grade={status()}
											data-quad-grades={letter ? gradeCodes(grades()) : undefined}
											data-key={key}
											class={`relative grid min-h-12 min-w-0 touch-manipulation place-items-center overflow-hidden rounded-lg text-xs font-bold aria-disabled:opacity-60 sm:text-sm ${letter ? 'max-w-10 flex-1' : 'min-w-12 px-1'}`}
											classList={{ 'bg-muted': !graded(), 'bg-background': graded() }}
										>
											<Show
												when={letter}
												fallback={
													key === 'Backspace' ? <Delete aria-hidden="true" class="size-4" /> : label
												}
											>
												<Show when={graded()}>
													<span
														aria-hidden="true"
														class="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-px"
													>
														<For each={BOARD_INDICES}>
															{(index) => (
																<span
																	class={`relative ${corners[grades()[index]]} ${cornerBars[index]}`}
																	classList={{ 'opacity-40': solved(index) }}
																/>
															)}
														</For>
													</span>
												</Show>
												{/* The cap face keeps the letter on one ground whatever the corners show. */}
												<span
													class="relative grid size-5 place-items-center rounded"
													classList={{
														'bg-card': graded(),
														'text-muted-foreground': spent(),
													}}
												>
													{label}
												</span>
											</Show>
										</button>
									)
								}}
							</For>
						</div>
					)}
				</For>
			</div>
		</Show>
	)
}
