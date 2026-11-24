/** @jsxImportSource solid-js */
import { batch, createMemo, createSignal, For, Index, onCleanup, onMount, Show } from 'solid-js'
import { BoardFinish, createBoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { checkGuess } from '@/lib/connect/puzzle-client'
import { createTranslator } from '@/lib/i18n/translate'
import { triggerHaptic } from '@/shared/hooks/use-haptic'
import { parseWordHiveClientPayload } from './parse-client'
import { checkHiveDraft, createInitialState, spellingBeeReducer } from './play-state'
import { readHiveGrade } from './read-grade'
import {
	getNextRankThreshold,
	RANK_THRESHOLDS,
	type SpellingBeeRank,
	type WordHivePlayData,
} from './types'

const slug = 'word-hive'
const positions = [
	[50, 17],
	[79, 33],
	[79, 67],
	[50, 83],
	[21, 67],
	[21, 33],
]
const errorKeys = {
	too_short: 'tooShort',
	missing_center: 'missingCenter',
	invalid_letter: 'invalidLetter',
	already_found: 'alreadyFound',
	not_in_list: 'notInList',
} as const
const ghostButton =
	'min-h-12 rounded-xl border border-border px-3 font-semibold aria-disabled:opacity-50'

export default function WordHiveBoard(props: DailyBoardProps) {
	const t = createTranslator(props.locale)
	const puzzle = createMemo(() => {
		try {
			return parseWordHiveClientPayload(props.puzzle.puzzleData)
		} catch {
			return null
		}
	})
	return (
		<Show when={puzzle()} keyed fallback={<p role="alert">{t('daily.unavailableTitle')}</p>}>
			{(data) => <Hive {...props} data={data} />}
		</Show>
	)
}

function Hive(props: DailyBoardProps & { data: WordHivePlayData }) {
	const t = createTranslator(props.locale)
	const finish = createBoardFinish(props, slug)
	const [state, setState] = createSignal(createInitialState(props.data))
	const [error, setError] = createSignal<keyof typeof errorKeys | 'grade'>()
	const [lastFound, setLastFound] = createSignal<{ word: string; pangram: boolean }>()
	const [result, setResult] = createSignal<{ rank: SpellingBeeRank; score: number }>()
	const [expanded, setExpanded] = createSignal(false)
	const dispatch = (action: Parameters<typeof spellingBeeReducer>[1]) =>
		setState((current) => spellingBeeReducer(current, action))
	const canPlay = () => state().gameStatus === 'playing' && !state().grading
	const rankLabel = (rank: SpellingBeeRank) =>
		t(`games.wordHive.ranks.${rank.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase())}`)
	const nextRank = createMemo(() => getNextRankThreshold(state().score, state().maxScore))
	const progress = () =>
		state().maxScore > 0 ? Math.min(100, (100 * state().score) / state().maxScore) : 0
	const visibleWords = createMemo(() => {
		const sorted = [...state().foundWords].sort()
		return expanded() ? sorted : sorted.slice(0, 5)
	})
	let disposed = false
	let pointerButton: HTMLElement | undefined
	const scoreLabel = (score: number) => `${t('gameResult.score')}: ${score}`

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
				const next = dispatch({ type: 'APPLY_WORD', word, grade })
				setLastFound({ word, pangram: grade.pangram })
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
			(target.isContentEditable ||
				target.closest('input, textarea, select, [contenteditable], [role="dialog"]'))
		)
			return
		if (event.key === 'Enter' || event.key === ' ') {
			if (
				target instanceof HTMLElement &&
				target.closest('button, a, summary') &&
				!(event.key === 'Enter' && target === pointerButton)
			)
				return
			event.preventDefault()
			if (event.repeat) return
			if (event.key === ' ') shuffle()
			else void submit()
		} else if (event.key === 'Backspace' || /^[a-z]$/i.test(event.key)) {
			event.preventDefault()
			edit(event.key === 'Backspace' ? event.key : event.key.toUpperCase())
		}
	}
	onMount(() => {
		window.addEventListener('keydown', handleKey)
		onCleanup(() => window.removeEventListener('keydown', handleKey))
	})
	onCleanup(() => {
		disposed = true
	})

	return (
		<div
			class="mx-auto w-full max-w-sm space-y-3"
			data-hive-board
			onClick={(event) => {
				const button =
					event.target instanceof Element &&
					event.target.closest<HTMLButtonElement>('button[data-hive-key]')
				if (button && event.detail > 0) pointerButton = button
			}}
			onFocusOut={() => {
				pointerButton = undefined
			}}
		>
			<div class="space-y-1.5 text-sm">
				<p class="flex justify-between gap-2 tabular-nums">
					<strong>{rankLabel(state().rank)}</strong>
					<span class="text-muted-foreground">{scoreLabel(state().score)}</span>
				</p>
				<div
					role="progressbar"
					aria-label={t('gameResult.score')}
					aria-valuenow={progress()}
					aria-valuetext={`${scoreLabel(state().score)} · ${rankLabel(state().rank)}`}
					class="relative h-2 overflow-hidden rounded-full bg-muted"
				>
					<div class="h-full bg-correct" style={{ width: `${progress()}%` }} />
					<For each={RANK_THRESHOLDS.slice(1, -1)}>
						{({ percentage }) => (
							<div
								class="absolute inset-y-0 w-px bg-foreground/30"
								style={{ left: `${percentage}%` }}
							/>
						)}
					</For>
				</div>
				<Show when={state().maxScore > 0 && nextRank()}>
					{(upcoming) => (
						<p class="text-xs text-muted-foreground">
							{rankLabel(upcoming().rank)}: +{upcoming().pointsNeeded}
						</p>
					)}
				</Show>
			</div>
			<div
				class="min-h-12 rounded-xl border border-border bg-background px-3 py-2 text-center font-display text-2xl font-bold tracking-widest break-all"
				aria-live="polite"
				lang="en"
				dir="ltr"
				data-hive-draft
			>
				<Show
					when={state().currentWord}
					fallback={
						<span aria-hidden="true" class="text-muted-foreground">
							|
						</span>
					}
				>
					<Index each={state().currentWord.split('')}>
						{(letter) => (
							<span
								classList={{
									'underline decoration-primary underline-offset-4':
										letter() === state().centerLetter,
								}}
							>
								{letter()}
							</span>
						)}
					</Index>
				</Show>
			</div>
			<fieldset
				aria-label={t('games.wordHive.name')}
				aria-busy={state().grading}
				class="relative mx-auto size-[222px]"
				dir="ltr"
			>
				<HexLetter
					letter={state().centerLetter}
					x={50}
					y={50}
					center
					disabled={!canPlay()}
					label={`${state().centerLetter} · ${t('games.wordHive.rules.rule2')}`}
					onPress={edit}
				/>
				<Index each={state().outerLetters}>
					{(letter, index) => (
						<HexLetter
							letter={letter()}
							x={positions[index][0]}
							y={positions[index][1]}
							disabled={!canPlay()}
							onPress={edit}
						/>
					)}
				</Index>
			</fieldset>
			<div class="flex flex-wrap justify-center gap-2">
				<button
					type="button"
					data-hive-key
					class={ghostButton}
					aria-disabled={!canPlay() || !state().currentWord}
					onClick={() => edit('Backspace')}
				>
					{t('games.wordHive.delete')}
				</button>
				<button
					type="button"
					data-hive-key
					class={ghostButton}
					aria-disabled={!canPlay()}
					onClick={shuffle}
				>
					{t('games.wordHive.shuffle')}
				</button>
				<button
					type="button"
					class="min-h-12 rounded-xl bg-primary px-4 font-bold text-primary-foreground aria-disabled:opacity-50"
					aria-disabled={!canPlay()}
					onClick={submit}
				>
					{t('games.wordHive.enter')}
				</button>
			</div>
			<Show when={state().grading}>
				<p role="status">{t('common.syncing')}</p>
			</Show>
			<Show when={error()}>
				{(key) => (
					<p role="alert" class="text-sm text-destructive">
						{key() === 'grade'
							? t('common.error')
							: t(`games.wordHive.messages.${errorKeys[key() as keyof typeof errorKeys]}`)}{' '}
						<Show when={key() === 'grade'}>
							<button type="button" class="min-h-12 font-semibold underline" onClick={submit}>
								{t('common.retry')}
							</button>
						</Show>
					</p>
				)}
			</Show>
			<Show when={lastFound()}>
				{(found) => (
					<p role="status" class="text-center text-sm">
						<strong lang="en">{found().word}</strong>
						<Show when={found().pangram}>
							{' · '}
							{t('games.wordHive.pangram')} {t('games.wordHive.pangramBonus')}
						</Show>
					</p>
				)}
			</Show>
			<section class="tactile-card space-y-2 p-3" aria-label={t('games.wordHive.foundWords')}>
				<h3 class="flex justify-between gap-2 text-sm font-semibold tabular-nums">
					<span>{t('games.wordHive.foundWords')}</span>
					<span>
						{state().foundWords.length}
						{state().totalWords > 0 ? `/${state().totalWords}` : ''}
					</span>
				</h3>
				<ul class="flex flex-wrap gap-2">
					<For each={visibleWords()}>
						{(word) => (
							<li
								class="max-w-full break-all rounded-lg bg-muted px-2 py-1 text-sm font-bold"
								classList={{ '!bg-correct !text-[#1a1712]': state().foundPangrams.includes(word) }}
							>
								<span lang="en">{word}</span>
								<Show when={state().foundPangrams.includes(word)}>
									<span aria-hidden="true"> ✦</span>
									<span class="sr-only">, {t('games.wordHive.pangram')}</span>
								</Show>
							</li>
						)}
					</For>
				</ul>
				<Show when={state().foundWords.length > 5}>
					<button
						type="button"
						aria-expanded={expanded()}
						class="min-h-12 text-sm font-semibold underline"
						onClick={() => setExpanded(!expanded())}
					>
						{expanded() ? t('games.wordHive.showLess') : t('games.wordHive.showAll')}
					</button>
				</Show>
			</section>
			<BoardFinish
				finish={finish}
				locale={props.locale}
				message={`${rankLabel(result()?.rank ?? 'beginner')} · ${scoreLabel(result()?.score ?? 0)}`}
			/>
		</div>
	)
}

function HexLetter(props: {
	letter: string
	label?: string
	x: number
	y: number
	center?: boolean
	disabled: boolean
	onPress: (key: string) => void
}) {
	return (
		<button
			type="button"
			data-letter={props.letter}
			data-hive-key
			aria-label={props.label}
			aria-disabled={props.disabled}
			onClick={() => props.onPress(props.letter)}
			class="absolute grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-xl aria-disabled:opacity-55"
			style={{ left: `${props.x}%`, top: `${props.y}%` }}
		>
			<span
				lang="en"
				class="grid size-full place-items-center font-display text-2xl font-extrabold"
				classList={{
					'bg-primary text-primary-foreground': props.center,
					'bg-muted': !props.center,
				}}
				style={{ 'clip-path': 'polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)' }}
			>
				{props.letter}
			</span>
		</button>
	)
}
