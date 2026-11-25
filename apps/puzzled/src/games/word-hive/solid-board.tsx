/** @jsxImportSource solid-js */
import { batch, createMemo, createSignal, For, Index, onCleanup, onMount, Show } from 'solid-js'
import { BoardFinish, createBoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { checkGuess } from '@/lib/connect/puzzle-client'
import { createTranslator, type Translate } from '@/lib/i18n/translate'
import { triggerHaptic } from '@/shared/hooks/use-haptic'
import { parseWordHiveClientPayload } from './parse-client'
import { checkHiveDraft, createInitialState, spellingBeeReducer } from './play-state'
import { readHiveGrade } from './read-grade'
import {
	getNextRankThreshold,
	RANK_THRESHOLDS,
	type SpellingBeeRank,
	type SpellingBeeState,
	type WordHivePlayData,
} from './types'
import './hive.css'

const slug = 'word-hive'
// Flat-top regular hexes: 80 units across the flats, with 6 units between them.
const hexHeight = 80
const hexWidth = (2 * hexHeight) / Math.sqrt(3)
const pitch = hexHeight + 6
const positions = [
	[0, -pitch],
	[(pitch * Math.sqrt(3)) / 2, -pitch / 2],
	[(pitch * Math.sqrt(3)) / 2, pitch / 2],
	[0, pitch],
	[(-pitch * Math.sqrt(3)) / 2, pitch / 2],
	[(-pitch * Math.sqrt(3)) / 2, -pitch / 2],
] as const
// Use a single coordinate box for the key geometry, with room for the key edges.
const combWidth = 250
const combHeight = 264

const errorKeys = {
	too_short: 'tooShort',
	missing_center: 'missingCenter',
	invalid_letter: 'invalidLetter',
	already_found: 'alreadyFound',
	not_in_list: 'notInList',
} as const

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
	const [state, setState] = finish.draft.signal(
		'state',
		createInitialState(props.data),
		(value) => ({ ...value, grading: false }),
	)
	const [error, setError] = createSignal<keyof typeof errorKeys | 'grade'>()
	const [lastFound, setLastFound] = createSignal<{
		word: string
		pangram: boolean
		points: number
	}>()
	const [result, setResult] = createSignal<{ rank: SpellingBeeRank; score: number }>()
	const dispatch = (action: Parameters<typeof spellingBeeReducer>[1]) =>
		setState((current) => spellingBeeReducer(current, action))
	const canPlay = () => state().gameStatus === 'playing' && !state().grading
	const rankLabel = (rank: SpellingBeeRank) => translateRank(t, rank)
	const errorMessage = () => {
		const key = error()
		if (!key) return ''
		return key === 'grade' ? t('common.error') : t(`games.wordHive.messages.${errorKeys[key]}`)
	}
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
			class="mx-auto w-full max-w-sm space-y-2"
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
			<RankRail state={state()} t={t} />
			<div
				class="h-[3.25rem] rounded-xl border border-border bg-surface px-3 text-center"
				data-hive-draft
			>
				<div
					class="h-full content-center overflow-y-auto py-2 font-display text-2xl leading-8 font-bold tracking-widest wrap-anywhere"
					aria-live="polite"
					lang="en"
					dir="ltr"
				>
					<Show
						when={state().currentWord}
						fallback={<span aria-hidden="true" class="hive-caret" />}
					>
						<Index each={state().currentWord.split('')}>
							{(letter) => (
								<span
									classList={{
										'text-accent-warm-foreground underline decoration-2 underline-offset-4':
											letter() === state().centerLetter,
									}}
								>
									{letter()}
								</span>
							)}
						</Index>
					</Show>
				</div>
			</div>
			<div class="flex h-12 items-center justify-center gap-2 text-sm" data-hive-feedback>
				<p role="status" class="min-w-0 text-center font-semibold">
					<Show when={state().grading}>
						<span class="text-muted-foreground">{t('common.syncing')}</span>
					</Show>
					<Show when={lastFound()}>
						{(found) => (
							<span
								class="wrap-anywhere"
								classList={{ 'text-accent-warm-foreground': found().pangram }}
							>
								<Show when={found().pangram}>
									<span aria-hidden="true">✦ </span>
									{t('games.wordHive.pangram')}
									{' · '}
								</Show>
								<strong lang="en">{found().word}</strong>
								{' · '}
								<span class="tabular-nums">+{found().points}</span>
							</span>
						)}
					</Show>
				</p>
				<p role="alert" class="min-w-0 text-center font-semibold text-destructive">
					{errorMessage()}
				</p>
				<Show when={error() === 'grade'}>
					<button
						type="button"
						class="min-h-12 min-w-12 shrink-0 rounded-md px-2 font-semibold underline"
						onClick={submit}
					>
						{t('common.retry')}
					</button>
				</Show>
			</div>
			<fieldset
				aria-label={t('games.wordHive.name')}
				aria-busy={state().grading}
				class="hive-comb"
				style={{ 'aspect-ratio': `${combWidth} / ${combHeight}` }}
				dir="ltr"
			>
				<HexLetter
					letter={state().centerLetter}
					x={0}
					y={0}
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
			<div class="grid grid-cols-3 gap-2">
				<button
					type="button"
					data-hive-key
					class="hive-action"
					aria-disabled={!canPlay() || !state().currentWord}
					onClick={() => {
						if (state().currentWord) edit('Backspace')
					}}
				>
					{t('games.wordHive.delete')}
				</button>
				<button
					type="button"
					data-hive-key
					class="hive-action"
					aria-disabled={!canPlay()}
					onClick={shuffle}
				>
					{t('games.wordHive.shuffle')}
				</button>
				<button
					type="button"
					class="hive-action hive-action-enter"
					aria-disabled={!canPlay()}
					onClick={submit}
				>
					{t('games.wordHive.enter')}
				</button>
			</div>
			<FoundWords state={state()} t={t} />
			<BoardFinish
				finish={finish}
				locale={props.locale}
				message={`${rankLabel(result()?.rank ?? 'beginner')} · ${scoreLabel(result()?.score ?? 0)}`}
			/>
		</div>
	)
}

function RankRail(props: { state: SpellingBeeState; t: Translate }) {
	const rankLabel = (rank: SpellingBeeRank) => translateRank(props.t, rank)
	const score = () => `${props.t('gameResult.score')}: ${props.state.score}`
	const progress = () =>
		props.state.maxScore > 0 ? Math.min(100, (props.state.score / props.state.maxScore) * 100) : 0
	const nextRank = createMemo(
		() => props.state.maxScore > 0 && getNextRankThreshold(props.state.score, props.state.maxScore),
	)
	const reached = () => RANK_THRESHOLDS.findIndex(({ rank }) => rank === props.state.rank)

	return (
		<div class="rounded-xl border border-border bg-surface px-3 py-2">
			<div class="flex min-h-7 items-center justify-between gap-2">
				<strong class="font-display text-lg leading-tight">{rankLabel(props.state.rank)}</strong>
				<span class="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-bold tabular-nums">
					{score()}
				</span>
			</div>
			<div
				role="progressbar"
				aria-label={props.t('gameResult.score')}
				aria-valuenow={progress()}
				aria-valuetext={`${score()} · ${rankLabel(props.state.rank)}`}
				class="relative mx-1.5 my-2 h-3"
			>
				<div class="absolute top-1/2 h-px w-full -translate-y-1/2 bg-muted-foreground" />
				<div
					class="absolute top-1/2 h-0.5 -translate-y-1/2 bg-accent-warm-foreground"
					style={{ width: `${(reached() / (RANK_THRESHOLDS.length - 1)) * 100}%` }}
				/>
				<For each={RANK_THRESHOLDS}>
					{(_, index) => (
						<span
							class="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
							classList={{
								'size-2 rounded-full border border-muted-foreground bg-surface':
									index() > reached(),
								'size-2 rotate-45 rounded-xs bg-accent-warm-foreground': index() < reached(),
								'size-3 rotate-45 rounded-xs bg-accent-warm-foreground': index() === reached(),
							}}
							style={{ left: `${(index() / (RANK_THRESHOLDS.length - 1)) * 100}%` }}
						/>
					)}
				</For>
			</div>
			<p class="min-h-4 text-xs font-semibold text-muted-foreground tabular-nums">
				<Show when={nextRank()}>
					{(next) =>
						props.t('games.wordHive.nextRank', {
							points: next().pointsNeeded,
							rank: rankLabel(next().rank),
						})
					}
				</Show>
			</p>
		</div>
	)
}

function translateRank(t: Translate, rank: SpellingBeeRank) {
	return t(
		`games.wordHive.ranks.${rank.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase())}`,
	)
}

function FoundWords(props: { state: SpellingBeeState; t: Translate }) {
	const sortedWords = createMemo(() => [...props.state.foundWords].sort())
	return (
		<details class="group rounded-xl border border-border bg-surface">
			<summary class="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3 text-sm font-semibold">
				<span>{props.t('games.wordHive.foundWords')}</span>
				<span class="flex items-center gap-2.5 text-muted-foreground tabular-nums">
					<span>
						{props.state.foundWords.length}
						{props.state.totalWords > 0 ? `/${props.state.totalWords}` : ''}
					</span>
					<span
						aria-hidden="true"
						class="mr-0.5 mb-1 size-2 rotate-45 border-r-2 border-b-2 group-open:mt-1 group-open:mb-0 group-open:rotate-225"
					/>
				</span>
			</summary>
			<Show
				when={sortedWords().length > 0}
				fallback={
					<p class="px-3 pb-3 text-sm text-muted-foreground">{props.t('games.wordHive.noWords')}</p>
				}
			>
				<ul class="flex flex-wrap gap-1.5 border-t border-border p-3">
					<For each={sortedWords()}>
						{(word) => (
							<li class="max-w-full rounded-md bg-muted px-2 py-1 text-sm font-semibold wrap-anywhere">
								<Show when={props.state.foundPangrams.includes(word)}>
									<span aria-hidden="true" class="text-accent-warm-foreground">
										✦{' '}
									</span>
									<span class="sr-only">{props.t('games.wordHive.pangram')}: </span>
								</Show>
								<span lang="en">{word}</span>
							</li>
						)}
					</For>
				</ul>
			</Show>
		</details>
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
		<div
			class="hive-key"
			classList={{ 'hive-key-center': props.center }}
			style={{
				left: `${50 + (props.x / combWidth) * 100}%`,
				top: `${50 + (props.y / combHeight) * 100}%`,
				width: `${(hexWidth / combWidth) * 100}%`,
				height: `${(hexHeight / combHeight) * 100}%`,
			}}
		>
			<button
				type="button"
				data-letter={props.letter}
				data-hive-key
				aria-label={props.label}
				aria-disabled={props.disabled}
				onClick={() => props.onPress(props.letter)}
			>
				<span lang="en" class="hive-key-face">
					{props.letter}
				</span>
			</button>
		</div>
	)
}
