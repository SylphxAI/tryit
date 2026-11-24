/** @jsxImportSource solid-js */
import { Shuffle } from 'lucide-solid'
import { createMemo, createSignal, For, Index, onCleanup, Show } from 'solid-js'
import { shuffleArray } from '@/games/shared/random'
import { BoardFinish, createBoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { checkGuess } from '@/lib/connect/puzzle-client'
import { createTranslator } from '@/lib/i18n/translate'
import { triggerHaptic } from '@/shared/hooks/use-haptic'
import { parseWordGroupsClientPayload } from './parse-client'
import {
	CATEGORY_COLORS,
	type Category,
	MAX_MISTAKES,
	TOTAL_CATEGORIES,
	WORDS_PER_CATEGORY,
} from './types'

const gameSlug = 'word-groups'
const action =
	'min-h-12 rounded-xl border border-border px-3 text-xs font-semibold disabled:opacity-50 sm:px-5 sm:text-sm'

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isCategory(value: unknown): value is Category {
	return (
		isRecord(value) &&
		typeof value.name === 'string' &&
		value.name.length > 0 &&
		(value.level === 0 || value.level === 1 || value.level === 2 || value.level === 3) &&
		Array.isArray(value.words) &&
		value.words.length === WORDS_PER_CATEGORY &&
		value.words.every((word) => typeof word === 'string') &&
		new Set(value.words).size === WORDS_PER_CATEGORY
	)
}

function parseGrade(value: unknown, guess: string[], solved: Category[]) {
	if (!isRecord(value) || typeof value.oneAway !== 'boolean') throw new Error('invalid_group_grade')
	if (value.correct === false) return { oneAway: value.oneAway }
	const { category } = value
	if (
		value.correct !== true ||
		!isCategory(category) ||
		solved.some((cat) => cat.name === category.name) ||
		!category.words.every((word) => guess.includes(word))
	)
		throw new Error('invalid_group_grade')
	return { category, oneAway: false }
}

function parseReveal(json: string | undefined): Category[] {
	if (!json) return []
	try {
		const data: unknown = JSON.parse(json)
		if (
			isRecord(data) &&
			Array.isArray(data.categories) &&
			data.categories.length === TOTAL_CATEGORIES &&
			data.categories.every(isCategory)
		)
			return data.categories
	} catch {
		// The accepted result remains usable even without its optional reveal.
	}
	return []
}

export default function GroupsBoard(props: DailyBoardProps) {
	const t = createTranslator(props.locale)
	const puzzle = createMemo(() => {
		try {
			const words = parseWordGroupsClientPayload(props.puzzle.puzzleData)
			return new Set(words).size === words.length ? words : undefined
		} catch {
			return undefined
		}
	})
	return (
		<Show when={puzzle()} keyed fallback={<p role="alert">{t('daily.unavailableTitle')}</p>}>
			{(words) => <Board {...props} words={words} />}
		</Show>
	)
}

function Board(props: DailyBoardProps & { words: string[] }) {
	const t = createTranslator(props.locale)
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

	return (
		<div class="mx-auto w-full max-w-md space-y-3 text-center">
			<div class="flex items-center justify-between gap-2 text-sm">
				<span class="text-muted-foreground">{t('games.wordGroups.tagline')}</span>
			</div>
			<For each={categories()}>
				{(category) => (
					<div
						data-group-category
						class={[
							'rounded-xl px-2 py-3',
							CATEGORY_COLORS[category.level].bg,
							CATEGORY_COLORS[category.level].text,
						].join(' ')}
					>
						<h3 class="font-display text-base font-bold uppercase">{category.name}</h3>
						<p class="text-sm">{category.words.join(', ')}</p>
					</div>
				)}
			</For>
			<Show when={playing()}>
				<fieldset class="min-w-0 space-y-3" disabled={grading()} aria-busy={grading()}>
					<legend class="sr-only">{t('games.wordGroups.name')}</legend>
					<Show when={shuffleRound() + 1} keyed>
						{(round) => (
							<div class="word-grid grid w-full grid-cols-4">
								<For each={remaining()}>
									{(word, index) => {
										const longest = Math.max(6, ...word.split(/\s+/).map((part) => part.length))
										const active = () => selected().includes(word)
										return (
											<button
												type="button"
												class="word-tile"
												classList={{ 'animate-shuffle-tile': round > 1 }}
												aria-pressed={active()}
												data-selected={active() ? 'true' : undefined}
												style={{
													'--word-len': longest,
													'--word-tracking': longest >= 9 ? '-0.01em' : undefined,
													'animation-delay': round > 1 ? `${index() * 20}ms` : undefined,
												}}
												onClick={() => toggle(word)}
											>
												<span class="word-tile-label">{word}</span>
											</button>
										)
									}}
								</For>
							</div>
						)}
					</Show>
					<div class="flex flex-wrap justify-center gap-2">
						<button type="button" class={action} onClick={shuffle}>
							<Shuffle aria-hidden="true" class="mr-1 inline size-4" />
							{t('games.wordGroups.shuffle')}
						</button>
						<button
							type="button"
							class={action}
							disabled={!selected().length}
							onClick={() => {
								setSelected([])
								setFeedback(undefined)
							}}
						>
							{t('games.wordGroups.deselect')}
						</button>
						<button
							type="button"
							class={`${action} board-submit`}
							data-ready={canSubmit() ? 'true' : undefined}
							onClick={grade}
						>
							{t('games.wordGroups.submit')}
						</button>
					</div>
				</fieldset>
				<output
					class="flex items-center justify-center gap-2"
					aria-label={t('games.wordGroups.mistakesRemaining', {
						remaining: left(),
						total: MAX_MISTAKES,
					})}
				>
					<span class="text-xs text-muted-foreground" aria-hidden="true">
						{t('games.wordGroups.mistakes')}:
					</span>
					<Index each={Array.from({ length: MAX_MISTAKES })}>
						{(_, i) => (
							<span
								aria-hidden="true"
								class="size-2.5 rounded-full"
								classList={{ 'bg-foreground/70': i < left(), 'bg-muted': i >= left() }}
							/>
						)}
					</Index>
				</output>
				<div class="min-h-6 text-sm" role="status">
					{grading()
						? t('common.syncing')
						: feedback() === 'error'
							? t('common.error')
							: feedback()
								? t(`games.wordGroups.messages.${feedback()}`, {
										count: WORDS_PER_CATEGORY - selected().length,
									})
								: ''}
				</div>
			</Show>
			<BoardFinish
				finish={finish}
				locale={props.locale}
				message={left() ? t('gameResult.congratulations') : t('games.wordGroups.messages.gameOver')}
			/>
		</div>
	)
}
