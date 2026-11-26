/** @jsxImportSource solid-js */
import { ArrowDownUp, ChevronLeft, ChevronRight } from 'lucide-solid'
import { For, Show } from 'solid-js'
import type { Translate } from '@/lib/i18n/translate'
import type { CrosswordPlay } from './create-crossword-play'
import type { CrosswordDirection, CrosswordPuzzleClientData } from './types'

const directions = ['across', 'down'] as const
const clueControl =
	'rounded-lg enabled:hover:bg-accent-warm-soft enabled:active:bg-background focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground disabled:opacity-45'
const clueArrow = `grid min-h-11 min-w-11 shrink-0 place-items-center bg-card ${clueControl}`

type ClueLabels = { t: Translate; directionName: (direction: CrosswordDirection) => string }

export function CrosswordClueBanner(
	props: ClueLabels & {
		clues: CrosswordPuzzleClientData['clues']
		play: Pick<
			CrosswordPlay,
			'activeClue' | 'state' | 'acrossOnly' | 'playing' | 'stepClue' | 'toggleDirection'
		>
	},
) {
	const { clues, t, directionName } = props
	const { activeClue, state, acrossOnly, playing, stepClue, toggleDirection } = props.play
	const clueCount = clues.across.length + clues.down.length
	const activeClueLabel = () => {
		const clue = activeClue()
		return clue
			? `${clue.number} ${directionName(state().direction)}: ${clue.clue}`
			: t('games.crossword.selectCell')
	}
	return (
		<div
			class="flex items-center gap-1 rounded-xl border border-border bg-accent-warm-soft p-1"
			data-crossword-clue-bar
		>
			<button
				type="button"
				class={clueArrow}
				aria-label={t('games.crossword.previousClue')}
				disabled={!playing() || clueCount <= 1}
				onClick={(event) => stepClue(-1, event)}
			>
				<ChevronLeft size={20} aria-hidden="true" />
			</button>
			<Show
				when={!acrossOnly}
				fallback={
					<span role="status" class="min-w-0 flex-1 wrap-anywhere px-2 text-sm font-semibold">
						{activeClueLabel()}
					</span>
				}
			>
				<button
					type="button"
					class={`flex min-h-11 min-w-0 flex-1 items-center justify-between gap-1 px-2 text-start text-sm font-semibold ${clueControl}`}
					disabled={!playing()}
					onClick={toggleDirection}
				>
					<span class="min-w-0 wrap-anywhere">{activeClueLabel()}</span>
					<ArrowDownUp size={14} class="shrink-0 text-muted-foreground" aria-hidden="true" />
					<span class="sr-only">{t('games.crossword.switchDirection')}</span>
				</button>
				<span role="status" class="sr-only">
					{activeClueLabel()}
				</span>
			</Show>
			<button
				type="button"
				class={clueArrow}
				aria-label={t('games.crossword.nextClue')}
				disabled={!playing() || clueCount <= 1}
				onClick={(event) => stepClue(1, event)}
			>
				<ChevronRight size={20} aria-hidden="true" />
			</button>
		</div>
	)
}

export function CrosswordClueList(
	props: ClueLabels & {
		clues: CrosswordPuzzleClientData['clues']
		play: Pick<
			CrosswordPlay,
			'activeClue' | 'acrossOnly' | 'playing' | 'filled' | 'total' | 'selectClue'
		>
	},
) {
	const { clues, t, directionName } = props
	const { activeClue, acrossOnly, playing, filled, total, selectClue } = props.play
	return (
		<details class="crossword-clues">
			<summary class="min-h-11 cursor-pointer py-2 text-sm font-semibold">
				<span>{t('games.crossword.clues')}</span>
				<span
					class="float-end rounded-full bg-muted px-2 text-xs leading-5 text-muted-foreground tabular-nums sm:hidden"
					dir="ltr"
				>
					{filled()} / {total}
				</span>
			</summary>
			<div class="grid grid-cols-2 gap-3">
				<For each={acrossOnly ? ['across' as const] : directions}>
					{(direction) => (
						<section class="space-y-1">
							<h3 class="font-display font-bold">{directionName(direction)}</h3>
							<ol class="space-y-1">
								<For each={clues[direction]}>
									{(clue) => (
										<li>
											<button
												type="button"
												disabled={!playing()}
												aria-current={activeClue() === clue ? 'true' : undefined}
												class="min-h-11 w-full rounded-lg px-2 text-start text-sm wrap-anywhere enabled:hover:bg-muted aria-current:bg-accent-warm-soft aria-current:font-semibold aria-current:enabled:hover:bg-accent-warm-soft"
												onClick={() => selectClue(clue, direction)}
											>
												<strong>{clue.number}.</strong> {clue.clue}
											</button>
										</li>
									)}
								</For>
							</ol>
						</section>
					)}
				</For>
			</div>
		</details>
	)
}
