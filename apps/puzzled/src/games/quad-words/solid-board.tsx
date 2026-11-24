/** @jsxImportSource solid-js */
import { Delete } from 'lucide-solid'
import { batch, createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { BoardFinish, createBoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { isValidWord } from '@/games/word-guess/words'
import { checkGuess } from '@/lib/connect/puzzle-client'
import { createTranslator } from '@/lib/i18n/translate'
import { triggerHaptic } from '@/shared/hooks/use-haptic'
import { createInitialState, quordleReducer } from './play-state'
import { readQuadGrade } from './read-grade'
import { type LetterStatus, MAX_GUESSES } from './types'

const slug = 'quad-words'
const keys = [
	'QWERTYUIOP'.split(''),
	'ASDFGHJKL'.split(''),
	['Enter', ...'ZXCVBNM'.split(''), 'Backspace'],
]
const boards = [0, 1, 2, 3] as const
const rows = [0, 1, 2, 3, 4]
const cols = [0, 1, 2, 3, 4]
const tones: Record<LetterStatus, string> = {
	correct: 'bg-correct text-[#1a1712] underline decoration-2 underline-offset-2',
	present: 'bg-present text-[#1a1712] outline-dashed -outline-offset-2',
	absent: 'bg-muted text-muted-foreground',
	empty: 'bg-background',
}

export default function QuadWordsBoard(props: DailyBoardProps) {
	const t = createTranslator(props.locale)
	const finish = createBoardFinish(props, slug)
	const [state, setState] = createSignal(createInitialState())
	const [error, setError] = createSignal<'length' | 'notInWordList' | 'grade'>()
	const dispatch = (action: Parameters<typeof quordleReducer>[1]) =>
		setState((current) => quordleReducer(current, action))
	const canPlay = () => state().gameStatus === 'playing' && !state().grading
	const solvedCount = () => state().boards.filter((board) => board.solved).length
	const reveal = createMemo(() => {
		if (finish.state() !== 'accepted' || state().gameStatus !== 'lost') return []
		try {
			const { words } = JSON.parse(finish.revealJson() ?? '{}') as { words?: unknown }
			if (
				Array.isArray(words) &&
				words.length === 4 &&
				words.every((word) => typeof word === 'string' && /^[a-z]{5}$/i.test(word))
			)
				return words as string[]
		} catch {
			// Only show a reveal supplied by the accepted finish.
		}
		return []
	})
	let disposed = false

	async function submit() {
		if (!canPlay()) return
		const word = state().currentGuess
		if (word.length !== 5) {
			setError('length')
			triggerHaptic('error')
			return
		}
		if (!isValidWord(word)) {
			setError('notInWordList')
			triggerHaptic('error')
			return
		}
		setError(undefined)
		dispatch({ type: 'GRADING', grading: true })
		triggerHaptic('submit')
		try {
			const result = await checkGuess({
				gameSlug: slug,
				puzzleId: props.puzzle.puzzleId,
				puzzleDate: props.puzzle.puzzleDate,
				difficulty: props.difficulty,
				guess: { word },
			})
			if (disposed) return
			const results = readQuadGrade(result)
			if (!results) throw new Error('invalid_quad_grade')
			batch(() => {
				const next = dispatch({ type: 'APPLY_GUESS', guess: word, results })
				if (next.gameStatus !== 'playing') {
					finish.finish(
						{ guessHistory: next.guessHistory },
						{
							attempts: next.guessHistory.length,
							status: next.gameStatus,
						},
					)
				}
			})
		} catch {
			if (disposed) return
			batch(() => {
				dispatch({ type: 'GRADING', grading: false })
				setError('grade')
			})
			triggerHaptic('error')
		}
	}

	function press(key: string) {
		if (!canPlay()) return
		if (key === 'Enter') void submit()
		else {
			setError(undefined)
			triggerHaptic('keyPress')
			dispatch(
				key === 'Backspace' ? { type: 'DELETE_LETTER' } : { type: 'ADD_LETTER', letter: key },
			)
		}
	}

	function handleKey(event: KeyboardEvent) {
		if (
			!canPlay() ||
			event.defaultPrevented ||
			event.isComposing ||
			event.ctrlKey ||
			event.metaKey ||
			event.altKey
		)
			return
		const target = event.target
		if (
			target instanceof HTMLElement &&
			(target.isContentEditable || target.closest('input, textarea, select'))
		)
			return
		if (
			event.key === 'Enter' &&
			target instanceof HTMLElement &&
			target.closest('button, a, summary')
		)
			return
		if (!(event.key === 'Enter' || event.key === 'Backspace' || /^[a-z]$/i.test(event.key))) return
		event.preventDefault()
		if (event.key !== 'Enter' || !event.repeat) press(event.key)
	}
	onMount(() => {
		window.addEventListener('keydown', handleKey)
		onCleanup(() => window.removeEventListener('keydown', handleKey))
	})
	onCleanup(() => {
		disposed = true
	})

	const feedback = (status: LetterStatus | undefined) =>
		status && status !== 'empty' ? t(`games.wordGuess.rules.${status}`) : undefined

	return (
		<div class="mx-auto w-full max-w-[30rem] space-y-3" data-quad-board>
			<div class="flex flex-wrap items-center justify-between gap-x-3 text-sm">
				<p role="status" class="tabular-nums text-muted-foreground">
					{solvedCount()}/4 · {t('gameResult.attempts')} {state().guessHistory.length}/{MAX_GUESSES}
				</p>
				{/* CheckGuess caps the served puzzle at nine; only ungraded input can be cleared. */}
				<button
					type="button"
					class="min-h-12 font-semibold underline disabled:opacity-50"
					disabled={!canPlay() || !state().currentGuess}
					onClick={() => {
						if (!canPlay()) return
						setError(undefined)
						setState((current) => ({ ...current, currentGuess: '' }))
					}}
				>
					{t('games.quadWords.clearGuess')}
				</button>
			</div>
			<Show when={error()}>
				<p role="alert" class="text-sm text-destructive">
					{error() === 'length'
						? t('games.quadWords.messages.notEnoughLetters')
						: error() === 'notInWordList'
							? t('games.wordGuess.messages.notInWordList')
							: t('common.error')}{' '}
					<Show when={error() === 'grade'}>
						<button type="button" class="min-h-12 font-semibold underline" onClick={submit}>
							{t('common.retry')}
						</button>
					</Show>
				</p>
			</Show>
			<div class="grid grid-cols-2 gap-2" dir="ltr">
				<For each={boards}>
					{(index) => {
						const board = () => state().boards[index]
						const active = () => !board().solved && state().gameStatus === 'playing'
						const offset = () =>
							Math.max(0, board().guesses.length - rows.length + Number(active()))
						return (
							<div
								class="rounded-xl border border-border bg-muted p-1.5 sm:p-2"
								classList={{ 'border-correct': board().solved }}
							>
								<table class="w-full table-fixed border-separate border-spacing-0.5" lang="en">
									<caption class="pb-0.5 text-xs font-semibold tabular-nums" lang={props.locale}>
										{t('games.quadWords.name')} {index + 1}
										{board().solved ? ' ✓' : ''}
									</caption>
									<tbody>
										<For each={rows}>
											{(row) => {
												const i = () => row + offset()
												const current = () => active() && i() === board().guesses.length
												const word = () =>
													current() ? state().currentGuess : (board().guesses[i()] ?? '')
												return (
													<tr>
														<For each={cols}>
															{(col) => {
																const tile = () => board().results[i()]?.[col]
																return (
																	<td
																		data-grade={tile()}
																		class={`h-6 rounded border border-transparent text-center font-display text-xs font-bold sm:h-8 sm:text-sm ${tones[tile() ?? 'empty']} ${current() ? '!border-foreground' : ''}`}
																	>
																		{word()[col]}
																		<Show when={tile()}>
																			<span class="sr-only" lang={props.locale}>
																				, {feedback(tile())}
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
								<Show when={!board().solved && reveal()[index]}>
									<p class="text-center text-sm font-semibold uppercase" lang="en">
										{reveal()[index]}
									</p>
								</Show>
							</div>
						)
					}}
				</For>
			</div>
			<Show when={state().gameStatus === 'playing'}>
				<div class="mx-auto grid max-w-md gap-1" aria-busy={state().grading} dir="ltr">
					<For each={keys}>
						{(row) => (
							<div class="flex justify-center gap-0.5 sm:gap-1">
								<For each={row}>
									{(key) => {
										const label =
											key === 'Backspace'
												? t('games.wordGuess.keyboard.delete')
												: key === 'Enter'
													? t('games.wordGuess.keyboard.enter')
													: key
										const status = () => state().keyboardStatus.get(key)
										return (
											<button
												type="button"
												onClick={() => press(key)}
												aria-disabled={state().grading}
												aria-label={status() ? `${label}, ${feedback(status())}` : label}
												data-grade={status()}
												data-key={key}
												class={`grid min-h-12 min-w-0 place-items-center rounded-lg px-0.5 text-xs font-bold aria-disabled:opacity-60 sm:text-sm ${key.length === 1 ? 'max-w-10 flex-1' : 'min-w-12 px-1'} ${tones[status() ?? 'empty']} ${status() ? '' : '!bg-muted'}`}
											>
												{key === 'Backspace' ? <Delete aria-hidden="true" class="size-4" /> : label}
											</button>
										)
									}}
								</For>
							</div>
						)}
					</For>
				</div>
			</Show>
			<Show when={state().grading}>
				<p role="status">{t('common.syncing')}</p>
			</Show>

			<BoardFinish
				finish={finish}
				locale={props.locale}
				message={
					state().gameStatus === 'won' ? t('games.quadWords.complete') : t('gameResult.gameOver')
				}
				shareText={
					t('games.quadWords.name') +
					' ' +
					solvedCount() +
					'/4 · ' +
					state().guessHistory.length +
					'/' +
					MAX_GUESSES
				}
			/>
		</div>
	)
}
