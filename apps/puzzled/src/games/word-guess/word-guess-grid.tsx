/** @jsxImportSource solid-js */
import { type Accessor, Index, Show } from 'solid-js'
import type { Translate } from '@/lib/i18n/translate'
import type { Feedback } from './feedback'
import type { FiveRow } from './guess-run'
import { MAX_GUESSES, WORD_LENGTH } from './types'

const cells = Array.from({ length: WORD_LENGTH }, (_, i) => i)
const slots = Array.from({ length: MAX_GUESSES }, (_, i) => i)

type WordGuessGridProps = {
	t: Translate
	rows: Accessor<FiveRow[]>
	draft: Accessor<string>
	pendingWord: Accessor<string | undefined>
	outcome: Accessor<'won' | 'lost' | undefined>
	inactive: Accessor<boolean>
	busy: Accessor<boolean>
	tone: (grade: Feedback | undefined, fallback: string) => string
	rules: (grade: Feedback) => string
	onTileClick: (event: MouseEvent & { currentTarget: HTMLButtonElement }) => void
}

export function WordGuessGrid(props: WordGuessGridProps) {
	const { t, rows, draft, pendingWord, outcome, inactive, busy, tone, rules, onTileClick } = props
	return (
		<table
			aria-label={t('games.wordGuess.name')}
			class="mx-auto border-separate border-spacing-1.5"
		>
			<tbody>
				<Index each={slots}>
					{(_, row) => (
						<tr data-current={row === rows().length && !outcome() ? '' : undefined}>
							<Index each={cells}>
								{(_, col) => {
									const tile = () => rows()[row]?.tiles[col]
									const letter = () =>
										(
											rows()[row]?.word[col] ??
											(row === rows().length ? (pendingWord() ?? draft())[col] : '') ??
											''
										).toUpperCase()
									const activeSlot = () =>
										!inactive() && row === rows().length && col === draft().length
									const ungradedTone = () =>
										activeSlot()
											? 'border-accent-warm bg-accent-warm-soft inset-ring-1 inset-ring-accent-warm/45'
											: letter()
												? 'border-muted-foreground bg-card'
												: 'border-border bg-card'
									return (
										<td
											data-grade={tile()}
											data-active-slot={activeSlot() ? 'true' : undefined}
											class={`size-11 rounded-lg border-2 text-center align-middle font-display text-2xl font-bold sm:size-[3.25rem] ${tone(tile(), ungradedTone())}`}
										>
											<Show when={row === rows().length && !outcome()} fallback={letter()}>
												<button
													type="button"
													class="grid size-full min-h-10 min-w-10 place-items-center rounded-md"
													tabIndex={col === 0 ? 0 : -1}
													aria-label={letter() || t('games.wordGuess.messages.useKeyboard')}
													disabled={busy()}
													onClick={onTileClick}
												>
													{letter()}
												</button>
											</Show>
											<Show when={tile()}>
												{(value) => <span class="sr-only">: {rules(value())}</span>}
											</Show>
										</td>
									)
								}}
							</Index>
						</tr>
					)}
				</Index>
			</tbody>
		</table>
	)
}
