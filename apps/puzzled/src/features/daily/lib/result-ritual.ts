import type { GetTodayProgressResponse } from '@/gen/connect/puzzled/v1/puzzle_pb'
import { claimedDailyPicks, DAILY_FREE_PICKS, dailyPickCount } from './daily-picks'

/** Private result timer; the public share image still uses a coarse time band. */
export function formatResultElapsed(milliseconds: number | null | undefined): string | null {
	if (milliseconds == null || !Number.isFinite(milliseconds) || milliseconds < 0) return null
	const seconds = Math.floor(milliseconds / 1000)
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/** Only a same-day server response can recommend a free game or celebrate the full set. */
export function resultRitual(
	progress: GetTodayProgressResponse,
	dayKey: string,
	currentGame: string,
	lineup: readonly string[],
) {
	const picks = claimedDailyPicks(progress, dayKey)
	if (!picks) return null
	const finished = new Map(progress.games.map((game) => [game.gameSlug, game.hasCompleted]))
	// The finish already visible in the dialog was accepted before this read.
	finished.set(currentGame, true)
	const picked = new Set(picks)
	const completed = Math.min(DAILY_FREE_PICKS, picks.filter((slug) => finished.get(slug)).length)
	const unplayed = lineup.find((slug) => !picked.has(slug) && finished.get(slug) === false)
	const unfinishedPick = lineup.find((slug) => picked.has(slug) && finished.get(slug) === false)
	return {
		used: dailyPickCount(picks),
		completed,
		next: picks.length < DAILY_FREE_PICKS && unplayed ? unplayed : unfinishedPick,
		resume: !(picks.length < DAILY_FREE_PICKS && unplayed),
	}
}
