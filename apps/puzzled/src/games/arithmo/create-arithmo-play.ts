import { createMemo, createSignal, onCleanup, onMount } from 'solid-js'
import { createBoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { gradeBoardGuess } from '@/games/shared/solid/grade-board-guess'
import { isAlreadyPlayedError } from '@/lib/connect/already-played'
import { triggerHaptic } from '@/shared/hooks/use-haptic'
import { parseGrade, updateKeyboardStatus } from './feedback'
import {
	type CharStatus,
	EQUATION_LENGTH,
	isValidEquation,
	MAX_ATTEMPTS,
	VALID_CHARS,
} from './types'

const badges = { correct: '🟩', present: '🟨', absent: '⬛' }
type GradedRow = { guess: string; tiles: NonNullable<ReturnType<typeof parseGrade>> }

export function createArithmoPlay(props: DailyBoardProps) {
	const finish = createBoardFinish(props, 'arithmo')
	const [graded, setGraded] = finish.draft.signal<GradedRow[]>('graded', [])
	const [keyboard, setKeyboard] = finish.draft.signal<Record<string, CharStatus>>('keyboard', {})
	const [draft, setDraft] = finish.draft.signal('draft', '')
	const [grading, setGrading] = createSignal(false)
	const [tileHelp, setTileHelp] = createSignal(false)
	const [error, setError] = createSignal<'notComplete' | 'invalid' | 'grade'>()
	const [outcome, setOutcome] = createSignal<'won' | 'lost'>()
	const inactive = () => grading() || Boolean(outcome())
	let disposed = false
	onCleanup(() => {
		disposed = true
	})

	function edit(key: string) {
		if (inactive()) return
		setTileHelp(false)
		setError(undefined)
		if (key === 'Backspace') setDraft((guess) => guess.slice(0, -1))
		else if (VALID_CHARS.includes(key)) setDraft((guess) => (guess + key).slice(0, EQUATION_LENGTH))
	}

	async function grade() {
		if (inactive()) return
		setTileHelp(false)
		const guess = draft()
		if (!isValidEquation(guess)) {
			setError(guess.length < EQUATION_LENGTH ? 'notComplete' : 'invalid')
			triggerHaptic('error')
			return
		}
		setError(undefined)
		setGrading(true)
		triggerHaptic('submit')
		try {
			const reply = await gradeBoardGuess(props, 'arithmo', { equation: guess })
			if (disposed) return
			const tiles = parseGrade(reply)
			if (!tiles) throw new Error('invalid_arithmo_grade')
			const next = [...graded(), { guess, tiles }]
			setGraded(next)
			setKeyboard((previous) => updateKeyboardStatus(previous, guess, tiles))
			setDraft('')
			const status = tiles.every((tile) => tile === 'correct')
				? 'won'
				: next.length === MAX_ATTEMPTS
					? 'lost'
					: undefined
			if (status) {
				setOutcome(status)
				finish.finish({ guesses: next.map((row) => row.guess) }, { status, attempts: next.length })
			}
		} catch (cause) {
			if (!disposed) {
				if (props.mode !== 'practice' && isAlreadyPlayedError(cause)) props.onAlreadyPlayed()
				else {
					setError('grade')
					triggerHaptic('error')
				}
			}
		} finally {
			if (!disposed) setGrading(false)
		}
	}

	function onKeyDown(event: KeyboardEvent) {
		if (
			inactive() ||
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
			(target.isContentEditable ||
				target.closest('input, textarea, select, [role="textbox"], dialog, [role="dialog"]'))
		)
			return
		if (event.key === 'Enter') {
			if (
				target instanceof HTMLElement &&
				target.closest('button, a, summary, [role="button"]') &&
				!target.closest('[data-arithmo-keypad]')
			)
				return
			event.preventDefault()
			if (!event.repeat) void grade()
		} else if (event.key === 'Backspace' || VALID_CHARS.includes(event.key)) {
			event.preventDefault()
			edit(event.key)
		}
	}
	onMount(() => {
		window.addEventListener('keydown', onKeyDown)
		onCleanup(() => window.removeEventListener('keydown', onKeyDown))
	})

	const reveal = createMemo(() => {
		if (finish.state() !== 'accepted' || outcome() !== 'lost') return
		try {
			const value: unknown = JSON.parse(finish.revealJson() ?? 'null')
			if (
				value &&
				typeof value === 'object' &&
				'equation' in value &&
				typeof value.equation === 'string' &&
				isValidEquation(value.equation)
			)
				return value.equation
		} catch {
			/* Missing or malformed reveal: show only the accepted outcome. */
		}
	})
	const shareText = () =>
		graded()
			.map((row) => row.tiles.map((tile) => badges[tile]).join(''))
			.join('\n')

	return {
		finish,
		graded,
		keyboard,
		draft,
		grading,
		tileHelp,
		error,
		outcome,
		inactive,
		showTileHelp: () => {
			if (!inactive()) setTileHelp(true)
		},
		edit,
		grade,
		reveal,
		shareText,
	}
}
