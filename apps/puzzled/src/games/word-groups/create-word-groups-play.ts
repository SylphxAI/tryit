import { createMemo, createSignal, onCleanup } from 'solid-js'
import { shuffleArray } from '@/games/shared/random'
import { createBoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { checkGuess } from '@/lib/connect/puzzle-client'
import { triggerHaptic } from '@/shared/hooks/use-haptic'
import { parseGrade, parseReveal } from './parse-client'
import { wordGroupsSharePattern } from './share-pattern'
import { type Category, MAX_MISTAKES, TOTAL_CATEGORIES, WORDS_PER_CATEGORY } from './types'

const gameSlug = 'word-groups'

export function createWordGroupsPlay(props: DailyBoardProps & { words: string[] }) {
	const finish = createBoardFinish(props, gameSlug)
	const [remaining, setRemaining] = finish.draft.signal('remaining', props.words)
	const [selected, setSelected] = finish.draft.signal<string[]>('selected', [])
	const [solved, setSolved] = finish.draft.signal<Category[]>('solved', [])
	const [mistakes, setMistakes] = finish.draft.signal('mistakes', 0)
	const [grading, setGrading] = createSignal(false)
	const [feedback, setFeedback] = createSignal<
		'correct' | 'oneAway' | 'incorrect' | 'error' | 'selectionFull' | 'pickMore' | 'alreadyGuessed'
	>()
	const [shuffleRound, setShuffleRound] = createSignal(0)
	const [history, setHistory] = finish.draft.signal('history', new Set<string>())
	let disposed = false
	onCleanup(() => {
		disposed = true
	})

	const playing = () => finish.state() === 'playing'
	const canSubmit = () => playing() && !grading() && selected().length === WORDS_PER_CATEGORY
	const left = () => MAX_MISTAKES - mistakes()
	const categories = createMemo(() => {
		const revealed =
			finish.state() === 'accepted' && !left() ? parseReveal(finish.revealJson()) : []
		return [
			...solved(),
			...revealed.filter((cat) => !solved().some((known) => known.name === cat.name)),
		].sort((a, b) => a.level - b.level)
	})
	function toggle(word: string) {
		if (grading() || !playing()) return
		const current = selected()
		if (current.includes(word)) setSelected(current.filter((value) => value !== word))
		else if (current.length < WORDS_PER_CATEGORY) setSelected([...current, word])
		else {
			setFeedback('selectionFull')
			return
		}
		setFeedback(undefined)
		triggerHaptic('select')
	}
	function shuffle() {
		if (grading() || !playing()) return
		setRemaining((words) => shuffleArray(words, Math.random))
		setShuffleRound((round) => round + 1)
	}
	async function grade() {
		if (!playing() || grading()) return
		const words = selected()
		if (words.length < WORDS_PER_CATEGORY) {
			setFeedback('pickMore')
			return
		}
		const key = JSON.stringify([...words].sort())
		if (history().has(key)) {
			setFeedback('alreadyGuessed')
			setSelected([])
			return
		}
		setFeedback(undefined)
		setGrading(true)
		try {
			const next = parseGrade(
				await checkGuess({
					gameSlug,
					puzzleId: props.puzzle.puzzleId,
					puzzleDate: props.puzzle.puzzleDate,
					difficulty: props.difficulty,
					guess: { words, solved: solved().map(({ name }) => name) },
				}),
				words,
				solved(),
			)
			if (disposed) return
			setHistory((seen) => new Set([...seen, key]))
			setSelected([])
			if (next.category) {
				const category = next.category
				setSolved((previous) => [...previous, category])
				setRemaining((previous) => previous.filter((word) => !words.includes(word)))
				setFeedback('correct')
				triggerHaptic('success')
			} else {
				setMistakes((count) => count + 1)
				setFeedback(next.oneAway ? 'oneAway' : 'incorrect')
				triggerHaptic(next.oneAway ? 'medium' : 'error')
			}
			const won = solved().length === TOTAL_CATEGORIES
			if (won || !left()) {
				finish.finish(
					{ foundCategories: solved().map(({ words }) => words), mistakes: mistakes() },
					{
						status: won ? 'won' : 'lost',
						attempts: history().size,
					},
				)
			}
		} catch {
			if (!disposed) setFeedback('error')
		} finally {
			if (!disposed) setGrading(false)
		}
	}

	const sharePattern = () => wordGroupsSharePattern(history(), solved())

	function deselect() {
		setSelected([])
		setFeedback(undefined)
	}

	return {
		finish,
		remaining,
		selected,
		grading,
		feedback,
		shuffleRound,
		playing,
		canSubmit,
		left,
		categories,
		toggle,
		shuffle,
		deselect,
		grade,
		sharePattern,
	}
}

export type WordGroupsPlay = ReturnType<typeof createWordGroupsPlay>
