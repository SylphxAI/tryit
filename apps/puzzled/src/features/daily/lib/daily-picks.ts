import type { GetTodayProgressResponse } from '@/gen/connect/puzzled/v1/puzzle_pb'
import { canonicalizeGameSlug } from '@/lib/game-slug'

/** The free floor, mirrored from puzzled-core. The server alone admits play. */
export const DAILY_FREE_PICKS = 3

/** An absent or stale read is not a count of zero. */
export function claimedDailyPicks(progress: GetTodayProgressResponse | null, dayKey: string) {
	if (progress?.dayKey !== dayKey || !progress.freePicks) return null
	return Array.from(new Set(progress.freePicks.gameSlugs.map(canonicalizeGameSlug)))
}

export function dailyPickCount(picks: readonly string[]): number {
	return Math.min(DAILY_FREE_PICKS, picks.length)
}

/** Only confirmed, unfinished picks get Resume links. Preserve start order. */
export function unfinishedDailyPicks(progress: GetTodayProgressResponse, picks: readonly string[]) {
	const unfinished = new Set(
		progress.games.filter((game) => !game.hasCompleted).map((game) => game.gameSlug),
	)
	return picks.filter((slug) => unfinished.has(slug))
}
