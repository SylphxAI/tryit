import { describe, expect, test } from 'bun:test'
import { getAllGameMetadata } from '@/games/registry'
import { choosesDailyLevel, disclosesFreePick } from './pick-disclosure'
import { DEFAULT_DAILY_DIFFICULTY } from './today-play-path'

// The same level list the game page builds from (game-data.ts).
const games = getAllGameMetadata().map((game) => ({
	slug: game.slug,
	levelCount: game.supportsDifficulty ? (game.difficultyLevels ?? []).length : 0,
}))
const quiet = ['playable', 'completed', 'closed', 'unavailable', 'locked'] as const

test('the catalog includes games with and without a level chooser', () => {
	expect(games.length).toBeGreaterThan(0)
	const choosers = games.filter((game) => game.levelCount > 0).map((game) => game.slug)
	expect(choosers).toEqual(expect.arrayContaining(['sudoku', 'killer-sudoku', 'nonogram']))
	expect(games.some((game) => game.levelCount === 0)).toBe(true)
})

describe.each(games)('$slug', ({ slug, levelCount }) => {
	for (const difficulty of [undefined, DEFAULT_DAILY_DIFFICULTY]) {
		const view = choosesDailyLevel({ archive: false, levelCount, difficulty })
			? 'level chooser'
			: 'start step'
		test(`the ${view} at level ${difficulty ?? 'none'} discloses the pick before Play`, () => {
			expect(disclosesFreePick('startable')).toBe(true)
			// The chooser only ever renders for games with levels and no level picked.
			expect(view === 'level chooser').toBe(levelCount > 0 && !difficulty)
		})
	}

	test('a started, finished, closed, unavailable or locked day says nothing', () => {
		for (const kind of quiet) expect(disclosesFreePick(kind)).toBe(false)
		expect(disclosesFreePick(undefined)).toBe(false)
	})
})

test('the archive never opens the chooser', () => {
	expect(choosesDailyLevel({ archive: true, levelCount: 3, difficulty: undefined })).toBe(false)
})
