/** @jsxImportSource solid-js */
import { Delete } from 'lucide-solid'
import { createMemo, createSignal, For, Index, onCleanup, onMount, Show } from 'solid-js'
import { readPlayDraftScope } from '@/features/daily/solid/play-scope'
import { BoardFinish, createBoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { gradeBoardGuess } from '@/games/shared/solid/grade-board-guess'
import { ensureGuestSession } from '@/lib/connect/transport'
import { createTranslator } from '@/lib/i18n/translate'
import { triggerHaptic } from '@/shared/hooks/use-haptic'
import { type Feedback, wordKeyFeedback } from './feedback'
import {
	type FiveRow,
	type FiveRun,
	forgetFiveRun,
	getFiveRun,
	hasFiveRuns,
	openFiveRun,
	sendFiveGuess,
} from './guess-run'
import { readFiveRunScope } from './run-scope'
import { KEYBOARD_ROWS, MAX_GUESSES, WORD_LENGTH } from './types'

const tones: Record<Feedback, string> = {
	correct: 'border-correct bg-correct text-[#1a1712]',
	present: 'border-present bg-present text-[#1a1712]',
	absent: 'border-border bg-muted text-muted-foreground',
}
const badges: Record<Feedback, string> = { correct: '🟪', present: '🟧', absent: '⬛' }
const cells = Array.from({ length: WORD_LENGTH }, (_, i) => i)
const slots = Array.from({ length: MAX_GUESSES }, (_, i) => i)
const gameSlug = 'word-guess'

export default function WordGuessBoard(props: DailyBoardProps) {
	const t = createTranslator(props.locale)
	const config = props.puzzle.puzzleData as { wordLength?: unknown; maxAttempts?: unknown } | null
	const playable = config?.wordLength === WORD_LENGTH && config.maxAttempts === MAX_GUESSES
	const puzzle = { puzzleId: props.puzzle.puzzleId, puzzleDate: props.puzzle.puzzleDate }
	const practice = props.mode === 'practice'
	const finish = createBoardFinish(props, gameSlug)
	const [rows, setRows] = finish.draft.signal<FiveRow[]>('rows', [])
	const [draft, setDraft] = finish.draft.signal('draft', '')
	const [pendingWord, setPendingWord] = createSignal<string>()
	const [grading, setGrading] = createSignal(false)
	const [checkingScope, setCheckingScope] = createSignal(false)
	const [error, setError] = createSignal<string>()
	const [showInputHint, setShowInputHint] = createSignal(false)
	const [outcome, setOutcome] = createSignal<'won' | 'lost'>()
	const keys = createMemo(() => wordKeyFeedback(rows()))
	const shareText = () =>
		rows()
			.map((row) => row.tiles.map((tile) => badges[tile]).join(''))
			.join('\n')
	const busy = () => checkingScope() || grading()
	const inactive = () => !playable || busy() || Boolean(outcome())
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
	let visibleRun: FiveRun | undefined
	let visibleScope: string | undefined
	const tone = (grade: Feedback | undefined, fallback: string) => (grade ? tones[grade] : fallback)
	const feedbackDescription = (grade: Feedback | undefined) => (grade ? rules(grade) : undefined)
	const rules = (grade: Feedback) => t(`games.wordGuess.rules.${grade}`)
	function edit(key: string) {
		if (inactive()) return
		setError(undefined)
		setShowInputHint(false)
		triggerHaptic('keyPress')
		if (key === 'BACKSPACE') setDraft((word) => word.slice(0, -1))
		else if (/^[a-z]$/i.test(key))
			setDraft((word) => (word + key.toLowerCase()).slice(0, WORD_LENGTH))
	}
	function applyRun(run: FiveRun, scope: string | undefined) {
		const next = run.rows
		setRows(next)
		setPendingWord(undefined)
		setDraft(run.failedWord ?? '')
		setError(
			run.failedWord
				? t(run.notInWordList ? 'games.wordGuess.messages.notInWordList' : 'common.error')
				: undefined,
		)
		const status = next.at(-1)?.tiles.every((tile) => tile === 'correct')
			? 'won'
			: next.length === MAX_GUESSES
				? 'lost'
				: undefined
		if (status) {
			// Terminal acceptance/re-entry is owned by SubmitGuess/GetDaily, not this cache.
			if (!practice) forgetFiveRun(scope, puzzle)
			setOutcome(status)
			finish.finish({ guesses: next.map(({ word }) => word) }, { status, attempts: next.length })
		}
	}
	async function watchRun(run: FiveRun, scope: string | undefined) {
		const pending = run.pending
		if (pending) {
			setGrading(true)
			setRows(run.rows)
			setPendingWord(pending.word)
			await pending.settled
		}
		if (!disposed) applyRun(run, scope)
	}
	async function grade() {
		if (inactive()) return
		setShowInputHint(false)
		const word = draft()
		if (word.length !== WORD_LENGTH) {
			triggerHaptic('error')
			setError(t('games.wordGuess.messages.notEnoughLetters'))
			return
		}
		setError(undefined)
		triggerHaptic('submit')
		setCheckingScope(true)
		try {
			const send = (run: FiveRun) =>
				sendFiveGuess(run, word, () => gradeBoardGuess(props, gameSlug, { word }))
			if (practice) {
				const run: FiveRun = { rows: rows() }
				setDraft('')
				send(run)
				await watchRun(run, undefined)
				return
			}
			// Bootstrap before reading the HttpOnly credential scope, just as CheckGuess does.
			await ensureGuestSession().catch(() => undefined)
			const [scope, draftScope] = await Promise.all([
				readFiveRunScope(),
				props.draftScope ? readPlayDraftScope() : undefined,
			])
			if (disposed) return
			if ((!scope && visibleScope) || (props.draftScope && draftScope !== props.draftScope)) {
				throw new Error('five_scope_unavailable')
			}
			const previous = visibleRun
			const same = previous ? scope === visibleScope : true
			const run = same && previous ? previous : openFiveRun(scope, puzzle, same ? rows() : [])
			visibleRun = run
			visibleScope = scope
			// If credentials or rows changed, reconcile what was already graded
			// rather than sending a word entered against a different view.
			if (!run.pending && (previous === run || (!previous && run.rows === rows()))) {
				// Pending input belongs only to the document-scoped request, never the draft.
				setDraft('')
				send(run)
			}
			await watchRun(run, scope)
		} catch {
			if (!disposed) setError(t('common.error'))
		} finally {
			if (!disposed) {
				setCheckingScope(false)
				setGrading(false)
			}
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
		if (!playable) return
		window.addEventListener('keydown', handleKey)
		onCleanup(() => window.removeEventListener('keydown', handleKey))
		if (practice || !hasFiveRuns()) return
		setCheckingScope(true)
		void readFiveRunScope()
			.then(async (scope) => {
				if (disposed) return
				const run = getFiveRun(scope, puzzle)
				if (run) {
					visibleRun = run
					visibleScope = scope
					await watchRun(run, scope)
				}
			})
			.catch(() => undefined)
			.finally(() => {
				if (!disposed) {
					setCheckingScope(false)
					setGrading(false)
				}
			})
	})
	onCleanup(() => {
		disposed = true
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
															onClick={(event) => {
																setShowInputHint(true)
																// Let physical Enter submit after a pointer click.
																if (event.detail > 0) event.currentTarget.blur()
																setError(undefined)
															}}
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
				<Show when={!outcome()}>
					<fieldset
						class="grid gap-1"
						aria-label={t('games.wordGuess.rules.rule2')}
						aria-busy={busy()}
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
													aria-disabled={busy() || undefined}
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
						<p role="status">{showInputHint() ? t('games.wordGuess.messages.useKeyboard') : ''}</p>
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
					practiceReveal={<p>{result()}</p>}
					shareTitle={t('games.wordGuess.name')}
					shareText={shareText()}
				/>
			</div>
		</Show>
	)
}
