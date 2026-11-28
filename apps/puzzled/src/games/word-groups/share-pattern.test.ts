import { describe, expect, test } from 'bun:test'
import { parseResultPattern, resultPatternSummary } from '@/features/daily/lib/result-card'
import { WORD_GROUPS_RESULT_TILE_COLORS } from '@/features/daily/lib/result-card-pattern'
import { wordGroupsSharePattern } from './share-pattern'
import { CATEGORY_COLORS, type Category } from './types'

const cat = (level: Category['level'], words: string[]): Category => ({
	name: `NAME${level}`,
	level,
	words,
})
const key = (words: string[]) => JSON.stringify([...words].sort())
const A = ['a1', 'a2', 'a3', 'a4']
const B = ['b1', 'b2', 'b3', 'b4']
const C = ['c1', 'c2', 'c3', 'c4']
const D = ['d1', 'd2', 'd3', 'd4']
const MISS = ['a1', 'b1', 'c1', 'd1']

describe('wordGroupsSharePattern', () => {
	test('a win is one row per guess in order, blue for the indigo band', () => {
		const solved = [cat(2, C), cat(0, A), cat(3, D), cat(1, B)]
		const text = wordGroupsSharePattern([key(C), key(MISS), key(A), key(D), key(B)], solved)
		expect(text).toBe('🟦🟦🟦🟦\n⬛⬛⬛⬛\n🟥🟥🟥🟥\n🟨🟨🟨🟨\n🟩🟩🟩🟩')
		expect(parseResultPattern(text, 'word-groups')).toEqual([
			['group2', 'group2', 'group2', 'group2'],
			['miss', 'miss', 'miss', 'miss'],
			['group0', 'group0', 'group0', 'group0'],
			['group3', 'group3', 'group3', 'group3'],
			['group1', 'group1', 'group1', 'group1'],
		])
	})

	test('a loss shows only graded guesses, never the revealed groups', () => {
		const misses = [
			MISS,
			['a1', 'b2', 'c3', 'd4'],
			['a2', 'b1', 'c4', 'd3'],
			['a3', 'b4', 'c1', 'd2'],
		]
		const text = wordGroupsSharePattern([key(A), ...misses.map(key)], [cat(0, A)])
		expect(text.split('\n')).toEqual(['🟥🟥🟥🟥', ...Array(4).fill('⬛⬛⬛⬛')])
		const zero = wordGroupsSharePattern(misses.map(key), [])
		expect(zero.split('\n')).toHaveLength(4)
		expect(zero).not.toMatch(/[🟥🟩🟦🟨]/u)
	})

	test('contains no words, names or digits', () => {
		const text = wordGroupsSharePattern([key(A), key(MISS)], [cat(0, A)])
		expect(text).not.toMatch(/[a-z0-9]/i)
	})

	test('falls back to no grid when the guess log is missing or incomplete', () => {
		expect(wordGroupsSharePattern([], [cat(0, A)])).toBe('')
		expect(wordGroupsSharePattern([key(MISS)], [cat(0, A), cat(1, B)])).toBe('')
		expect(wordGroupsSharePattern([], [])).toBe('')
	})

	test('band colours match the board', () => {
		for (const level of [0, 1, 2, 3] as const) {
			expect(CATEGORY_COLORS[level].bg).toBe(
				`bg-[${WORD_GROUPS_RESULT_TILE_COLORS[`group${level}`]}]`,
			)
		}
	})
})

describe('Quartet pattern codec', () => {
	test('rejects mixed rows, other glyphs, wrong widths and oversized grids', () => {
		expect(parseResultPattern('🟥🟥🟦🟥', 'word-groups')).toBeNull()
		expect(parseResultPattern('🟥🟥🟥', 'word-groups')).toBeNull()
		expect(parseResultPattern('🟥🟥🟥🟥🟥', 'word-groups')).toBeNull()
		expect(parseResultPattern('🟪🟪🟪🟪', 'word-groups')).toBeNull()
		expect(parseResultPattern('🟥🟥🟥🟥\nWORD', 'word-groups')).toBeNull()
		expect(parseResultPattern(Array(8).fill('⬛⬛⬛⬛').join('\n'), 'word-groups')).toBeNull()
		expect(parseResultPattern('', 'word-groups')).toBeNull()
	})

	test('other games keep the hit / near / miss codec', () => {
		expect(parseResultPattern('🟩🟨⬛', 'word-guess')).toEqual([['hit', 'near', 'miss']])
		expect(parseResultPattern('🟦🟦🟦🟦')).toBeNull()
	})

	test('the text alternative counts found bands as hits, without colour', () => {
		const pattern = parseResultPattern('🟦🟦🟦🟦\n⬛⬛⬛⬛', 'word-groups')
		expect(pattern).not.toBeNull()
		const summary = resultPatternSummary(pattern ?? [], {
			patternSummary: '{hit} hit / {near} near / {miss} miss',
		} as never)
		expect(summary).toBe('4 hit / 0 near / 4 miss')
	})
})
