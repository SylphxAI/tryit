import { createSignal, onCleanup, onMount } from 'solid-js'
import { readPlayDraftScope } from '@/features/daily/solid/play-scope'
import { createBoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { gradeBoardGuess } from '@/games/shared/solid/grade-board-guess'
import { ensureGuestSession } from '@/lib/connect/transport'
import type { Translate } from '@/lib/i18n/translate'
import { triggerHaptic } from '@/shared/hooks/use-haptic'
import { createWordGuessSound } from './create-word-guess-sound'
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
import { MAX_GUESSES, WORD_LENGTH } from './types'
import { createWordGuessKeyHandler } from './word-guess-physical-input'

const gameSlug = 'word-guess'

function canGiveFeedback(event: MouseEvent | KeyboardEvent) {
	return (
		event.isTrusted &&
		document.visibilityState === 'visible' &&
		!('repeat' in event && event.repeat)
	)
}

export function createWordGuessPlay(props: DailyBoardProps, t: Translate) {
	const config = props.puzzle.puzzleData as { wordLength?: unknown; maxAttempts?: unknown } | null
	const playable = config?.wordLength === WORD_LENGTH && config.maxAttempts === MAX_GUESSES
	const puzzle = { puzzleId: props.puzzle.puzzleId, puzzleDate: props.puzzle.puzzleDate }
	const practice = props.mode === 'practice'
	const finish = createBoardFinish(props, gameSlug)
	const sound = createWordGuessSound()
	const [rows, setRows] = finish.draft.signal<FiveRow[]>('rows', [])
	const [draft, setDraft] = finish.draft.signal('draft', '')
	const [pendingWord, setPendingWord] = createSignal<string>()
	const [grading, setGrading] = createSignal(false)
	const [checkingScope, setCheckingScope] = createSignal(false)
	const [error, setError] = createSignal<string>()
	const [showInputHint, setShowInputHint] = createSignal(false)
	const [outcome, setOutcome] = createSignal<'won' | 'lost'>()
	const busy = () => checkingScope() || grading()
	const inactive = () => !playable || busy() || Boolean(outcome())
	let disposed = false
	let visibleRun: FiveRun | undefined
	let visibleScope: string | undefined

	function showKeyboardHint() {
		setShowInputHint(true)
		setError(undefined)
	}

	function edit(key: string, event: MouseEvent | KeyboardEvent) {
		if (inactive()) return
		setError(undefined)
		setShowInputHint(false)
		const word = draft()
		const next =
			key === 'BACKSPACE'
				? word.slice(0, -1)
				: /^[a-z]$/i.test(key) && word.length < WORD_LENGTH
					? word + key.toLowerCase()
					: word
		if (next === word) return
		setDraft(next)
		if (canGiveFeedback(event)) {
			triggerHaptic('keyPress')
			void sound.tap()
		}
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
	async function grade(event: MouseEvent | KeyboardEvent) {
		if (inactive()) return
		setShowInputHint(false)
		const word = draft()
		if (word.length !== WORD_LENGTH) {
			if (canGiveFeedback(event)) triggerHaptic('error')
			setError(t('games.wordGuess.messages.notEnoughLetters'))
			return
		}
		setError(undefined)
		if (canGiveFeedback(event)) triggerHaptic('submit')
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

	const handleKey = createWordGuessKeyHandler(
		inactive,
		grade,
		edit,
		() => draft().length === WORD_LENGTH,
	)
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

	return {
		playable,
		finish,
		sound,
		rows,
		draft,
		pendingWord,
		grading,
		busy,
		inactive,
		error,
		showInputHint,
		outcome,
		showKeyboardHint,
		edit,
		grade,
	}
}
