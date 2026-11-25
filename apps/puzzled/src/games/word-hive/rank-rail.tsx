/** @jsxImportSource solid-js */
import { For } from 'solid-js'
import type { Translate } from '@/lib/i18n/translate'
import {
	getNextRankThreshold,
	RANK_THRESHOLDS,
	type SpellingBeeRank,
	type SpellingBeeState,
} from './types'

export function RankRail(props: { state: SpellingBeeState; t: Translate }) {
	const rankLabel = (rank: SpellingBeeRank) => translateRank(props.t, rank)
	const score = () => `${props.t('gameResult.score')}: ${props.state.score}`
	const progress = () =>
		props.state.maxScore > 0 ? Math.min(100, (props.state.score / props.state.maxScore) * 100) : 0
	const nextRankLabel = () => {
		const { score, maxScore } = props.state
		const next = maxScore > 0 ? getNextRankThreshold(score, maxScore) : null
		return next
			? props.t('games.wordHive.nextRank', {
					points: next.pointsNeeded,
					rank: rankLabel(next.rank),
				})
			: ''
	}
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
				{nextRankLabel()}
			</p>
		</div>
	)
}

export function translateRank(t: Translate, rank: SpellingBeeRank) {
	return t(
		`games.wordHive.ranks.${rank.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase())}`,
	)
}
