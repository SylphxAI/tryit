/** @jsxImportSource solid-js */
import { For, Show } from 'solid-js'
import type { Locale } from '@/lib/i18n/config'
import { BOARD_INDICES, type LetterStatus, type QuordleGameState } from './types'

const rows = [0, 1, 2, 3, 4, 5]
const cols = [0, 1, 2, 3, 4]
const tones: Record<LetterStatus, string> = {
	correct: 'bg-correct text-[#1a1712] underline decoration-2 underline-offset-2',
	present: 'bg-present text-[#1a1712] outline-dashed -outline-offset-2',
	absent: 'bg-muted text-muted-foreground',
	empty: 'bg-background',
}

type QuadGridProps = {
	state: QuordleGameState
	canPlay: boolean
	reveal: string[]
	locale: Locale
	boardName: (index: number) => string
	feedback: (status: LetterStatus | undefined) => string | undefined
}

export function QuadGrid(props: QuadGridProps) {
	return (
		<div class="play-board grid w-full grid-cols-2 gap-2" dir="ltr">
			<For each={BOARD_INDICES}>
				{(index) => {
					const board = () => props.state.boards[index]
					const active = () => !board().solved && props.state.gameStatus === 'playing'
					const offset = () => Math.max(0, board().guesses.length - rows.length + Number(active()))
					return (
						<div
							class="rounded-xl border border-border bg-muted p-1.5 sm:p-2"
							classList={{ 'border-correct': board().solved }}
						>
							<table class="w-full table-fixed border-separate border-spacing-0.5" lang="en">
								<caption class="pb-0.5 text-xs font-semibold tabular-nums" lang={props.locale}>
									{props.boardName(index)}
									{board().solved ? ' ✓' : ''}
								</caption>
								<tbody>
									<For each={rows}>
										{(row) => {
											const i = () => row + offset()
											const current = () => active() && i() === board().guesses.length
											const word = () =>
												current() ? props.state.currentGuess : (board().guesses[i()] ?? '')
											return (
												<tr>
													<For each={cols}>
														{(col) => {
															const tile = () => board().results[i()]?.[col]
															const activeSlot = () =>
																current() && props.canPlay && col === word().length
															const appearance = () =>
																activeSlot()
																	? 'border-accent-warm bg-accent-warm-soft inset-ring-1 inset-ring-accent-warm/45'
																	: `${tones[tile() ?? 'empty']} ${current() && word()[col] ? 'border-muted-foreground' : 'border-transparent'}`
															return (
																<td
																	data-grade={tile()}
																	data-active-slot={activeSlot() ? 'true' : undefined}
																	class={`h-6 rounded border text-center font-display text-xs font-bold sm:h-8 sm:text-sm ${appearance()}`}
																>
																	{word()[col]}
																	<Show when={tile()}>
																		<span class="sr-only" lang={props.locale}>
																			, {props.feedback(tile())}
																		</span>
																	</Show>
																</td>
															)
														}}
													</For>
												</tr>
											)
										}}
									</For>
								</tbody>
							</table>
							<Show when={!board().solved && props.reveal[index]}>
								<p class="text-center text-sm font-semibold uppercase" lang="en">
									{props.reveal[index]}
								</p>
							</Show>
						</div>
					)
				}}
			</For>
		</div>
	)
}
