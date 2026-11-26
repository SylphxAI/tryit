import { createMemo, createSignal, onCleanup, onMount } from 'solid-js'
import { createBoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { triggerHaptic } from '@/shared/hooks/use-haptic'
import { isFrameWord } from './dictionary'
import {
	allLettersUsed,
	getUsedLetters,
	hasValidSideTransitions,
	type LetterBox,
	startsWithLastLetter,
	usesValidLetters,
} from './types'

const slug = 'word-box'

export function createWordBoxPlay(props: DailyBoardProps, box: LetterBox) {
	const finish = createBoardFinish(props, slug, {
		onRejected() {
			const chain = words()
			setCurrent(chain.at(-1) ?? '')
			setWords(chain.slice(0, -1))
			setError('rejected')
		},
	})
	const [words, setWords] = finish.draft.signal<string[]>('words', [])
	const [current, setCurrent] = finish.draft.signal('current', '')
	const [error, setError] = createSignal<
		| 'invalidLetter'
		| 'sameSide'
		| 'wrongStart'
		| 'tooShort'
		| 'notInWordList'
		| 'dictionaryUnavailable'
		| 'rejected'
	>()
	const [checking, setChecking] = createSignal(false)
	const [confirmReset, setConfirmReset] = createSignal(false)
	let draft: HTMLInputElement | undefined
	let disposed = false
	onCleanup(() => {
		disposed = true
	})
	const used = createMemo(() => getUsedLetters(words()))
	const required = () => words().at(-1)?.slice(-1)
	const playable = () => finish.state() === 'playing' && !checking()
	const total = Object.values(box).reduce((count, letters) => count + letters.length, 0)

	function invalid(reason: NonNullable<ReturnType<typeof error>>) {
		triggerHaptic('error')
		setError(reason)
	}
	function add(letter: string) {
		if (!playable()) return
		const next = current() + letter
		if (!usesValidLetters(box, next)) return invalid('invalidLetter')
		if (!startsWithLastLetter(words().at(-1) ?? '', next)) return invalid('wrongStart')
		if (!hasValidSideTransitions(box, next)) return invalid('sameSide')
		setCurrent(next)
		setError(undefined)
		if (confirmReset()) draft?.focus({ preventScroll: true })
		triggerHaptic('light')
	}
	function backspace() {
		if (!playable()) return
		setCurrent((value) => value.slice(0, -1))
		setError(undefined)
	}
	async function addWord() {
		if (!playable()) return
		const word = current()
		if (word.length < 3) return invalid('tooShort')
		setChecking(true)
		setError(undefined)
		try {
			const valid = await isFrameWord(word)
			if (disposed) return
			if (!valid) return invalid('notInWordList')
		} catch {
			if (!disposed) invalid('dictionaryUnavailable')
			return
		} finally {
			if (!disposed) setChecking(false)
		}
		const next = [...words(), word]
		setWords(next)
		setCurrent('')
		setError(undefined)
		// The shared letter/chain rules qualify a play; only SubmitGuess can save a win.
		if (allLettersUsed(box, getUsedLetters(next)))
			finish.finish({ words: next }, { attempts: next.length })
	}
	function undoWord() {
		if (!playable() || current() || !words().length) return
		setCurrent(words().at(-1) ?? '')
		setWords((chain) => chain.slice(0, -1))
		setError(undefined)
	}
	function reset() {
		if (!playable()) return
		if ((words().length || current()) && !confirmReset()) {
			setConfirmReset(true)
			return
		}
		setConfirmReset(false)
		setCurrent('')
		setWords([])
		setError(undefined)
		draft?.focus({ preventScroll: true })
	}
	function keyDown(event: KeyboardEvent) {
		if (
			!playable() ||
			event.defaultPrevented ||
			event.altKey ||
			event.ctrlKey ||
			event.metaKey ||
			event.isComposing
		)
			return
		const target = event.target
		if (
			target instanceof HTMLElement &&
			(target.isContentEditable ||
				target.closest(
					'input:not(#frame-current), textarea, select, [role="textbox"], dialog, [role="dialog"]',
				))
		)
			return
		if (/^[a-z]$/i.test(event.key)) add(event.key.toUpperCase())
		else if (event.key === 'Backspace' || event.key === 'Delete') backspace()
		else if (
			event.key === 'Enter' &&
			!(
				target instanceof HTMLElement &&
				target.closest('button:not([data-box-letter]), a, summary, [role="button"]')
			)
		) {
			if (!event.repeat) void addWord()
		} else return
		event.preventDefault()
	}

	onMount(() => {
		window.addEventListener('keydown', keyDown)
		onCleanup(() => window.removeEventListener('keydown', keyDown))
	})

	return {
		finish,
		words,
		current,
		error,
		checking,
		confirmReset,
		used,
		required,
		playable,
		total,
		add,
		backspace,
		addWord,
		undoWord,
		reset,
		cancelReset: () => setConfirmReset(false),
		setDraft(element: HTMLInputElement) {
			draft = element
		},
	}
}
