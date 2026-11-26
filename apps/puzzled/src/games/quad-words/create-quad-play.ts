import { batch, createMemo, createSignal, onCleanup, onMount } from 'solid-js'
import { createBoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { gradeBoardGuess } from '@/games/shared/solid/grade-board-guess'
import { isValidWord } from '@/games/word-guess/words'
import { triggerHaptic } from '@/shared/hooks/use-haptic'
import { createInitialState, quordleReducer } from './play-state'
import { readQuadGrade } from './read-grade'

const slug = 'quad-words'

export function createQuadPlay(props: DailyBoardProps) {
	const finish = createBoardFinish(props, slug)
	const [state, setState] = finish.draft.signal('state', createInitialState(), (value) => ({
		...value,
		grading: false,
	}))
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
			const result = await gradeBoardGuess(props, slug, { word })
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

	function clearGuess() {
		if (!canPlay()) return
		setError(undefined)
		setState((current) => ({ ...current, currentGuess: '' }))
	}

	return { state, finish, canPlay, solvedCount, reveal, error, submit, press, clearGuess }
}
