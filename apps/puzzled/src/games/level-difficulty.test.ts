import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getAllGames } from './registry'

test('the five level boards pass the played level to the shared finish intent', () => {
	const levelGames = getAllGames().filter((config) => config.supportsDifficulty)
	expect(levelGames.map((config) => config.slug).sort()).toEqual([
		'block-slide',
		'crowns',
		'killer-sudoku',
		'nonogram',
		'sudoku',
	])
	for (const config of levelGames) {
		const dir = config.slug === 'crowns' ? 'queens' : config.slug
		const source = readFileSync(join(import.meta.dir, dir, 'solid-board.tsx'), 'utf8')
		expect(source).toContain('createBoardFinish(props,')
	}
	const finish = readFileSync(join(import.meta.dir, 'shared/solid/finish.tsx'), 'utf8')
	expect(finish).toContain('difficulty: options?.difficulty ?? props.difficulty')
})
