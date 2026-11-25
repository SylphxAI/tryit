import { batch, createSignal, onCleanup } from 'solid-js'
import { createBoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { checkGuess } from '@/lib/connect/puzzle-client'
import { triggerHaptic } from '@/shared/hooks/use-haptic'
import { checkHiveDraft, createInitialState, spellingBeeReducer } from './play-state'
import { readHiveGrade } from './read-grade'
import type { SpellingBeeRank, WordHivePlayData } from './types'

const slug = 'word-hive'

export function createHivePlay(props: DailyBoardProps & { data: WordHivePlayData }) {
	const finish = createBoardFinish(props, slug)
	const [state, setState] = finish.draft.signal(
		'state',
		createInitialState(props.data),
		(value) => ({ ...value, grading: false }),
	)
	const [error, setError] = createSignal<
		ReturnType<typeof checkHiveDraft> | 'not_in_list' | 'grade'
	>()
	const [lastFound, setLastFound] = createSignal<{
		word: string
		pangram: boolean
		points: number
	}>()
	const [result, setResult] = createSignal<{ rank: SpellingBeeRank; score: number }>()
	const dispatch = (action: Parameters<typeof spellingBeeReducer>[1]) =>
		setState((current) => spellingBeeReducer(current, action))
	const canPlay = () => state().gameStatus === 'playing' && !state().grading
	let disposed = false

	function hasLetter(letter: string) {
		return letter === state().centerLetter || state().outerLetters.includes(letter)
	}
	function edit(letter: string) {
		if (!canPlay()) return
		setLastFound(undefined)
		if (letter !== 'Backspace' && !hasLetter(letter)) {
			triggerHaptic('error')
			setError('invalid_letter')
			return
		}
		setError(undefined)
		triggerHaptic('keyPress')
		dispatch(letter === 'Backspace' ? { type: 'DELETE_LETTER' } : { type: 'ADD_LETTER', letter })
	}
	function shuffle() {
		if (!canPlay()) return
		triggerHaptic('light')
		dispatch({ type: 'SHUFFLE' })
	}

	async function submit() {
		if (!canPlay()) return
		setLastFound(undefined)
		const violation = checkHiveDraft(state())
		setError(violation)
		if (violation) {
			triggerHaptic('error')
			return
		}
		const word = state().currentWord
		dispatch({ type: 'GRADING', grading: true })
		triggerHaptic('submit')
		try {
			const response = await checkGuess({
				gameSlug: slug,
				puzzleId: props.puzzle.puzzleId,
				puzzleDate: props.puzzle.puzzleDate,
				difficulty: props.difficulty,
				guess: { word },
			})
			if (disposed) return
			const grade = readHiveGrade(response)
			if (!grade) throw new Error('invalid_hive_grade')
			if (!grade.valid) {
				batch(() => {
					dispatch({ type: 'REJECT_WORD' })
					setError('not_in_list')
				})
				triggerHaptic('error')
				return
			}
			triggerHaptic(grade.pangram ? 'win' : 'success')
			batch(() => {
				const previousScore = state().score
				const next = dispatch({ type: 'APPLY_WORD', word, grade })
				setLastFound({ word, pangram: grade.pangram, points: next.score - previousScore })
				// File the first Master (or Perfect Hive), but keep playing to find every word.
				if (
					!result() &&
					(next.rank === 'genius' || next.rank === 'queen-bee' || next.gameStatus === 'won')
				) {
					setResult({ rank: next.rank, score: next.score })
					finish.finish({ foundWords: next.foundWords }, { attempts: next.foundWords.length })
				}
			})
		} catch {
			if (disposed) return
			batch(() => {
				dispatch({ type: 'REJECT_WORD' })
				setError('grade')
			})
			triggerHaptic('error')
		}
	}

	onCleanup(() => {
		disposed = true
	})
	return { state, finish, error, lastFound, result, canPlay, edit, shuffle, submit }
}
