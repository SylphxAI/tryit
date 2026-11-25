import type { PuzzleDifficulty } from '@/games/types'
import { asDifficulty } from './difficulty-completion'
import { todayPlayPath } from './today-play-path'

// A claim is game-wide. This hint returns to the level this tab last opened.
const levelKey = (slug: string) => `puzzled:daily-level:${slug}`

export function rememberDailyLevel(dayKey: string, slug: string, difficulty?: PuzzleDifficulty) {
	if (!difficulty) return
	try {
		sessionStorage.setItem(levelKey(slug), `${dayKey}:${difficulty}`)
	} catch {
		/* Optional presentation hint. */
	}
}

export function dailyResumePath(dayKey: string, slug: string): string {
	try {
		const value = sessionStorage.getItem(levelKey(slug))
		if (value?.startsWith(`${dayKey}:`))
			return todayPlayPath(slug, asDifficulty(value.slice(dayKey.length + 1)))
	} catch {
		/* Use the default on another device or with storage blocked. */
	}
	return todayPlayPath(slug)
}
