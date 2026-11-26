import { createEffect, createMemo, createSignal, onCleanup } from 'solid-js'
import { trackHintUsed } from '@/features/analytics/lib/behavioral-events'
import type { createBoardFinish, DailyBoardProps } from '@/games/shared/solid/finish'
import { gradeBoardGuess } from '@/games/shared/solid/grade-board-guess'
import { isAlreadyPlayedError } from '@/lib/connect/already-played'
import { triggerHaptic } from '@/shared/hooks/use-haptic'
import {
	type CryptogramAction,
	createCryptogramState,
	cryptogramReducer,
	isFullyFilled,
} from './state'
import type { CryptogramPuzzleData } from './types'

export const cryptogramSlug = 'cryptogram'
export type CryptogramCopy = (key: string, values?: Record<string, string | number>) => string
export type CryptogramPlay = ReturnType<typeof createCryptogramPlay>

export function createCryptogramPlay(
	props: DailyBoardProps & { data: CryptogramPuzzleData },
	finish: ReturnType<typeof createBoardFinish>,
	copy: CryptogramCopy,
) {
	const [state, setState] = finish.draft.signal('state', createCryptogramState(props.data))
	const [hintPending, setHintPending] = createSignal(false)
	const [gradePending, setGradePending] = createSignal(false)
	const [gradeFailed, setGradeFailed] = createSignal(false)
	const [hintFailed, setHintFailed] = createSignal(false)
	const [notice, setNotice] = createSignal('')
	const [retryCount, retryGrade] = createSignal(0)
	const dispatch = (action: CryptogramAction) =>
		setState((previous) => cryptogramReducer(previous, action, props.data))
	const guesses = createMemo(() => state().guesses)
	const playing = createMemo(() => state().gameStatus === 'playing' && finish.state() === 'playing')
	const editable = () => playing() && !hintPending()
	let hintVersion = 0
	let noticeTimer: ReturnType<typeof setTimeout> | undefined
	onCleanup(() => {
		hintVersion++
		clearTimeout(noticeTimer)
	})
	const grade = (guess: unknown) => gradeBoardGuess(props, cryptogramSlug, guess)
	function gradeError(cause: unknown, fail: () => void) {
		if (props.mode !== 'practice' && isAlreadyPlayedError(cause)) props.onAlreadyPlayed()
		else fail()
	}

	createEffect(() => {
		retryCount()
		const submitted = guesses()
		setGradeFailed(false)
		if (!editable() || !isFullyFilled(submitted)) {
			setGradePending(false)
			return
		}
		setGradePending(true)
		let stale = false
		onCleanup(() => {
			stale = true
		})
		void grade({ guesses: submitted }).then(
			(answer) => {
				if (stale || guesses() !== submitted || !editable()) return
				setGradePending(false)
				const solved = (answer as { solved?: unknown } | null)?.solved
				if (typeof solved !== 'boolean') {
					setGradeFailed(true)
					return
				}
				if (solved) finish.finish({ guesses: submitted, hintsUsed: state().hintsUsed })
				dispatch({ type: 'CHECKED', guesses: submitted, solved })
			},
			(cause) => {
				if (stale) return
				setGradePending(false)
				gradeError(cause, () => setGradeFailed(true))
			},
		)
	})

	async function hint() {
		if (!canHint()) return
		const version = ++hintVersion
		setHintPending(true)
		setHintFailed(false)
		try {
			const answer = (await grade({
				hint: true,
				guesses: guesses(),
				revealed: state().revealedLetters,
			})) as { encrypted?: unknown; letter?: unknown } | null
			if (version !== hintVersion || !playing()) return
			if (typeof answer?.encrypted === 'string' && typeof answer.letter === 'string') {
				const used = state().hintsUsed
				dispatch({ type: 'REVEAL', encryptedLetter: answer.encrypted, letter: answer.letter })
				const hintCount = state().hintsUsed
				setHintFailed(used === hintCount)
				if (hintCount > used) {
					reportProgress()
					trackHintUsed(cryptogramSlug, props.mode ?? 'daily', hintCount)
				}
			} else setHintFailed(true)
		} catch (cause) {
			if (version === hintVersion) gradeError(cause, () => setHintFailed(true))
		} finally {
			if (version === hintVersion) setHintPending(false)
		}
	}

	const filled = createMemo(() => Object.values(guesses()).filter(Boolean).length)
	const remaining = () => props.data.maxHints - state().hintsUsed
	const canHint = () => editable() && !gradePending() && remaining() > 0
	const reportProgress = () =>
		finish.recordProgress((100 * filled()) / Math.max(1, Object.keys(guesses()).length))
	const selected = () => state().selectedLetter
	const isRevealed = (letter: string) => state().revealedLetters.includes(letter)
	const canType = () => {
		const letter = selected()
		return editable() && letter !== null && !isRevealed(letter)
	}
	function showNotice(message = '') {
		clearTimeout(noticeTimer)
		setNotice(message)
		if (message) noticeTimer = setTimeout(() => setNotice(''), 2500)
	}
	function select(letter: string | null) {
		showNotice()
		dispatch({ type: 'SELECT_LETTER', encryptedLetter: letter })
	}
	function typeLetter(letter: string) {
		if (!editable()) return
		const target = selected()
		if (!target) {
			showNotice(copy('selectFirst'))
			return
		}
		if (!canType()) return
		const previous = state()
		const from = Object.keys(previous.guesses).find(
			(key) => key !== target && previous.guesses[key] === letter,
		)
		const next = dispatch({ type: 'SET_GUESS', encryptedLetter: target, guessedLetter: letter })
		if (next === previous) return
		reportProgress()
		showNotice(from ? copy('letterMoved', { letter, from, to: target }) : '')
		triggerHaptic('light')
	}
	function clear() {
		const target = selected()
		if (target && canType()) {
			showNotice()
			dispatch({ type: 'CLEAR_GUESS', encryptedLetter: target })
			reportProgress()
		}
	}
	function reset() {
		if (!playing()) return
		hintVersion++
		setHintPending(false)
		setHintFailed(false)
		showNotice()
		dispatch({ type: 'RESET' })
		reportProgress()
	}

	const retry = () => retryGrade((n) => n + 1)
	return {
		state,
		guesses,
		selected,
		editable,
		isRevealed,
		canType,
		select,
		typeLetter,
		clear,
		filled,
		remaining,
		canHint,
		hint,
		reset,
		playing,
		gradeFailed,
		hintFailed,
		gradePending,
		hintPending,
		notice,
		retry,
	}
}
