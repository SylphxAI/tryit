/** @jsxImportSource solid-js */
import { useNavigate } from '@solidjs/router'
import { RotateCw } from 'lucide-solid'
import { createResource, createSignal, For, Match, onMount, Show, Suspense, Switch } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import type { GamePageData } from '@/features/catalog/solid/game-data'
import { asDifficulty } from '@/features/daily/lib/difficulty-completion'
import { gameBoards } from '@/games/shared/solid/board-registry'
import type { PuzzleDifficulty } from '@/games/types'
import { getPracticePuzzle } from '@/lib/connect/puzzle-client'
import { createTranslator } from '@/lib/i18n/translate'
import { practicePath, practiceRefusal } from '../lib/practice'
import { PracticeUnlock } from './practice-unlock'

export function PracticePlay(props: { data: GamePageData; difficulty?: PuzzleDifficulty }) {
	const { slug, locale, difficultyLevels, canonicalPath } = props.data
	const t = createTranslator(locale)
	const board = gameBoards.get(slug)
	const navigate = useNavigate()
	const level = props.difficulty ?? (difficultyLevels.length ? 'medium' : undefined)
	const [attempt, setAttempt] = createSignal(0)
	const newPuzzle = () => setAttempt((n) => n + 1)
	onMount(newPuzzle)
	const [read] = createResource(
		() => attempt() || false,
		async () => {
			try {
				const response = await getPracticePuzzle({
					gameSlug: slug,
					practiceSeed: 0n,
					difficulty: level,
				})
				const difficulty = asDifficulty(response.difficulty)
				const puzzleData: unknown = JSON.parse(response.puzzleDataJson)
				if (
					response.gameSlug !== slug ||
					response.practiceSeed <= 0n ||
					difficulty !== level ||
					puzzleData == null
				) {
					return { kind: 'error' } as const
				}
				return { kind: 'ready', seed: response.practiceSeed, difficulty, puzzleData } as const
			} catch (error) {
				const refusal = practiceRefusal(error)
				return refusal
					? ({ kind: 'locked', isGuest: refusal === 'guest' } as const)
					: ({ kind: 'error' } as const)
			}
		},
	)
	const loading = () => read.loading || !read.latest
	const value = () => !loading() && read.latest?.kind === 'ready' && read.latest
	const loadingNote = () => (
		<p class="text-center text-muted-foreground" role="status">
			{t('practice.loading')}
		</p>
	)
	return (
		<div class="group/practice mx-auto grid w-full min-w-0 max-w-xl gap-4" data-practice-play>
			<header class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
				<h2 class="inline-flex items-center rounded-full bg-muted px-3 py-1 font-display text-sm font-bold text-foreground">
					{t('practice.label')}
				</h2>
				<Show when={value()}>
					<div class="flex flex-wrap items-center gap-2">
						<a
							class="chrome-control min-h-12 px-2 text-sm underline group-has-[[data-practice-finish]]/practice:hidden"
							href={`${canonicalPath}#play`}
						>
							{t('practice.backToToday')}
						</a>
						<Show when={difficultyLevels.length}>
							<select
								class="min-h-12 max-w-full rounded-xl border border-border bg-background px-2 text-sm font-semibold"
								aria-label={t('common.difficulty.selectDifficulty')}
								onChange={(event) => {
									const next = asDifficulty(event.currentTarget.value)
									if (next && next !== level)
										navigate(practicePath(canonicalPath, next), { scroll: false })
								}}
							>
								<For each={difficultyLevels}>
									{({ level: currentLevel, label }) => (
										<option value={currentLevel} selected={currentLevel === level}>
											{label}
										</option>
									)}
								</For>
							</select>
						</Show>
						<button
							type="button"
							class="chrome-control min-h-12 gap-2 rounded-xl border border-border px-3 text-sm font-bold"
							onClick={newPuzzle}
						>
							<RotateCw size={16} aria-hidden="true" />
							{t('practice.newPuzzle')}
						</button>
					</div>
				</Show>
			</header>
			<Switch>
				<Match when={loading()}>{loadingNote()}</Match>
				<Match when={read.latest?.kind === 'locked' && read.latest}>
					{(lock) => <PracticeUnlock data={props.data} isGuest={lock().isGuest} />}
				</Match>
				<Match when={value()}>
					{(puzzle) => (
						<Show when={puzzle().seed} keyed>
							{(seed) => (
								<div
									class="game-stage min-w-0"
									data-practice-seed={String(seed)}
									data-game-stage="board"
									data-game-slug={slug}
								>
									<Suspense fallback={loadingNote()}>
										<Dynamic
											component={board}
											puzzle={{
												kind: 'playable',
												puzzleId: '',
												puzzleDate: '',
												puzzleData: puzzle().puzzleData,
											}}
											mode="practice"
											locale={locale}
											difficulty={puzzle().difficulty}
											practiceSeed={seed}
											isGuest={false}
											onAlreadyPlayed={() => {}}
											onNewPractice={newPuzzle}
										/>
									</Suspense>
								</div>
							)}
						</Show>
					)}
				</Match>
				<Match when={read.latest?.kind === 'error'}>
					<div class="completion-card" role="alert">
						<p>{t('practice.unavailable')}</p>
						<button
							type="button"
							class="chrome-control min-h-12 font-semibold underline"
							onClick={newPuzzle}
						>
							{t('common.retry')}
						</button>
					</div>
				</Match>
			</Switch>
			<Show when={read.latest?.kind !== 'locked' && !value()}>
				<a
					class="chrome-control min-h-12 justify-self-start underline"
					href={`${canonicalPath}#play`}
				>
					{t('practice.backToToday')}
				</a>
			</Show>
		</div>
	)
}
