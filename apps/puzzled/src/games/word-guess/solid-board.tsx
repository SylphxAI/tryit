/** @jsxImportSource solid-js */
import { Delete } from 'lucide-solid'
import { createMemo, createSignal, For, Index, onCleanup, onMount, Show } from 'solid-js'
import { BoardFinish, createBoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { checkGuess } from '@/lib/connect/puzzle-client'
import { createTranslator } from '@/lib/i18n/translate'
import { triggerHaptic } from '@/shared/hooks/use-haptic'
import { type Feedback, readWordFeedback, wordKeyFeedback } from './feedback'
import { KEYBOARD_ROWS, MAX_GUESSES, WORD_LENGTH } from './types'
import { isValidWord } from './words'

const tones: Record<Feedback, string> = {
	correct: 'border-correct bg-correct text-[#1a1712]',
	present: 'border-present bg-present text-[#1a1712]',
	absent: 'border-border bg-muted text-muted-foreground',
}
const badges: Record<Feedback, string> = { correct: '🟪', present: '🟧', absent: '⬛' }
const cells = Array.from({ length: WORD_LENGTH }, (_, i) => i)
const slots = Array.from({ length: MAX_GUESSES }, (_, i) => i)
const gameSlug = 'word-guess'

type Row = { word: string; tiles: Feedback[] }

export default function WordGuessBoard(props: DailyBoardProps) {
	const t = createTranslator(props.locale)
	const config = props.puzzle.puzzleData as { wordLength?: unknown; maxAttempts?: unknown } | null
	const playable = config?.wordLength === WORD_LENGTH && config.maxAttempts === MAX_GUESSES
	const [rows, setRows] = createSignal<Row[]>([])
	const [draft, setDraft] = createSignal('')
	const [grading, setGrading] = createSignal(false)
	const [error, setError] = createSignal<string>()
	const [outcome, setOutcome] = createSignal<'won' | 'lost'>()
	const finish = createBoardFinish(props, gameSlug)
	const keys = createMemo(() => wordKeyFeedback(rows()))
	const shareText = () =>
		rows()
			.map((row) => row.tiles.map((tile) => badges[tile]).join(''))
			.join('\n')
	const inactive = () => !playable || grading() || Boolean(outcome())
	const result = createMemo(() => {
		if (outcome() === 'won') return t('games.wordGuess.messages.correct')
		try {
			const { word } = JSON.parse(finish.revealJson() ?? '{}') as { word?: unknown }
			if (typeof word === 'string' && /^[a-z]{5}$/i.test(word)) {
				return t('games.wordGuess.messages.gameOver', { word: word.toUpperCase() })
			}
		} catch {
			// Do not guess at a reveal if the accepted response has no readable word.
		}
		return t('gameResult.gameOver')
	})
	let disposed = false
	const tone = (grade: Feedback | undefined, fallback: string) => (grade ? tones[grade] : fallback)
	const feedbackDescription = (grade: Feedback | undefined) => (grade ? rules(grade) : undefined)
	const rules = (grade: Feedback) => t(`games.wordGuess.rules.${grade}`)
	function edit(key: string) {
		if (inactive()) return
		setError(undefined)
		triggerHaptic('keyPress')
		if (key === 'BACKSPACE') setDraft((word) => word.slice(0, -1))
		else if (/^[a-z]$/i.test(key))
			setDraft((word) => (word + key.toLowerCase()).slice(0, WORD_LENGTH))
	}
	async function grade() {
		if (inactive()) return
		const word = draft()
		if (word.length !== WORD_LENGTH) {
			triggerHaptic('error')
			setError(t('games.wordGuess.messages.notEnoughLetters'))
			return
		}
		if (!isValidWord(word)) {
			triggerHaptic('error')
			setError(t('games.wordGuess.messages.notInWordList'))
			return
		}
		setError(undefined)
		triggerHaptic('submit')
		setGrading(true)
		try {
			const response = (await checkGuess({
				gameSlug,
				puzzleId: props.puzzle.puzzleId,
				puzzleDate: props.puzzle.puzzleDate,
				guess: { word },
			})) as { tiles?: unknown } | null
			if (disposed) return
			const tiles = readWordFeedback(response?.tiles)
			if (!tiles) throw new Error('invalid_word_grade')
			const next = [...rows(), { word, tiles }]
			setRows(next)
			setDraft('')
			const status = tiles.every((tile) => tile === 'correct')
				? 'won'
				: next.length === MAX_GUESSES
					? 'lost'
					: undefined
			if (status) {
				setOutcome(status)
				finish.finish({ guesses: next.map(({ word }) => word) }, { status, attempts: next.length })
			}
		} catch {
			if (!disposed) setError(t('common.error'))
		} finally {
			if (!disposed) setGrading(false)
		}
	}
	function handleKey(event: KeyboardEvent) {
		if (
			event.defaultPrevented ||
			event.isComposing ||
			event.ctrlKey ||
			event.altKey ||
			event.metaKey
		)
			return
		const target = event.target
		if (
			target instanceof HTMLElement &&
			(target.isContentEditable || target.closest('input, textarea, select, [contenteditable]'))
		)
			return
		if (event.key === 'Enter') {
			// Keep focused buttons and links natively activatable.
			if (target instanceof HTMLElement && target.closest('button, a, summary')) return
			if (inactive()) return
			event.preventDefault()
			if (!event.repeat) void grade()
		} else if (!inactive() && /^[a-z]$|^Backspace$/i.test(event.key)) {
			event.preventDefault()
			edit(event.key.toUpperCase())
		}
	}
	onMount(() => {
		if (playable) window.addEventListener('keydown', handleKey)
	})
	onCleanup(() => {
		disposed = true
		window.removeEventListener('keydown', handleKey)
	})

	return (
		<Show when={playable} fallback={<p role="status">{t('daily.unavailableTitle')}</p>}>
			<div class="mx-auto w-full max-w-md space-y-3">
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
													(row === rows().length ? draft()[col] : '') ??
													''
												).toUpperCase()
											return (
												<td
													data-grade={tile()}
													class={`size-11 rounded-lg border-2 text-center align-middle font-display text-2xl font-bold sm:size-[3.25rem] ${tone(tile(), letter() ? 'border-muted-foreground bg-card' : 'border-border bg-card')}`}
												>
													{letter()}
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
				<Show when={!outcome()}>
					<fieldset
						class="grid gap-1"
						aria-label={t('games.wordGuess.rules.rule2')}
						aria-busy={grading()}
					>
						<For each={KEYBOARD_ROWS}>
							{(row) => (
								<div class="flex justify-center gap-1">
									<For each={row}>
										{(key) => {
											const action = key === 'ENTER' || key === 'BACKSPACE'
											const label =
												key === 'ENTER'
													? t('games.wordGuess.keyboard.enter')
													: key === 'BACKSPACE'
														? t('games.wordGuess.keyboard.delete')
														: key
											const keyGrade = () => keys()[key]
											return (
												<button
													type="button"
													aria-label={label}
													aria-description={feedbackDescription(keyGrade())}
													data-grade={keyGrade()}
													aria-disabled={grading() || undefined}
													class={`flex min-h-12 min-w-0 items-center justify-center rounded-md border font-semibold touch-manipulation aria-disabled:opacity-60 ${action ? 'w-[14%] text-xs' : 'w-[9%] text-base'} ${tone(keyGrade(), 'border-border bg-key text-key-text')}`}
													onClick={() => (key === 'ENTER' ? void grade() : edit(key))}
												>
													{key === 'BACKSPACE' ? <Delete size={18} aria-hidden="true" /> : label}
												</button>
											)
										}}
									</For>
								</div>
							)}
						</For>
					</fieldset>
					<div class="min-h-6 text-center text-sm">
						<Show when={grading()}>
							<p role="status">{t('common.syncing')}</p>
						</Show>
						<Show when={error()}>
							<p role="alert" class="text-error">
								{error()}
							</p>
						</Show>
					</div>
				</Show>
				<BoardFinish
					finish={finish}
					locale={props.locale}
					message={result()}
					shareTitle={t('games.wordGuess.name')}
					shareText={shareText()}
				/>
			</div>
		</Show>
	)
}
