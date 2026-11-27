import type { DailySnapshot } from './daily-fallback'

/** Whether today's page opens on the level chooser rather than one board. */
export function choosesDailyLevel(input: {
	archive: boolean
	levelCount: number
	difficulty: string | undefined
}): boolean {
	return !input.archive && input.levelCount > 0 && !input.difficulty
}

/**
 * Whether the entry says that starting uses one of today's free picks. It
 * follows the snapshot, not the view: the level chooser and the start step both
 * come before the claim, so both disclose it. A started, finished, closed, locked or
 * unavailable day claims nothing and says nothing.
 */
export function disclosesFreePick(kind: DailySnapshot['kind'] | 'locked' | undefined): boolean {
	return kind === 'startable'
}
