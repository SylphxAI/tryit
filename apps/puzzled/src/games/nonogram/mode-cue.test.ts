import { expect, test } from 'bun:test'
import { createTranslator } from '@/lib/i18n/translate'
import { cueAfterMove, initialModeCue } from './mode-cue'
import type { CellState } from './types'

const day = '2026-11-28'
const start = initialModeCue(day, null)
const data = { width: 4, height: 1, rowClues: [[3]], colClues: [[1], [1], [1], [0]] }
const grid = (...cells: CellState[]) => [Object.freeze(cells) as CellState[]]
const empty = grid('empty', 'empty', 'empty', 'empty')
const first = grid('filled', 'empty', 'empty', 'empty')
const second = grid('filled', 'filled', 'empty', 'empty')

test('first visit has a mode label, same-day resume has no cue', () => {
	expect(start?.phase).toBe('mode')
	expect(createTranslator('en-US')('games.nonogram.currentMode', { mode: 'Fill' })).toBe(
		'Mode: Fill',
	)
	expect(initialModeCue(day, day)).toBeUndefined()
	expect(initialModeCue(day, '2026-11-27')).toEqual(start)
})

test('ordinary fills hide the intro without triggering a mistake cue', () => {
	const one = cueAfterMove(start, empty, first, data, 'filled')
	const two = cueAfterMove(one, first, second, data, 'filled')
	const three = cueAfterMove(
		two,
		second,
		grid('filled', 'filled', 'filled', 'empty'),
		data,
		'filled',
	)
	expect([one?.phase, two?.phase, three?.phase]).toEqual(['quiet', 'quiet', 'quiet'])
})

test('clearing the latest Fill triggers even where no clue was contradicted', () => {
	const one = cueAfterMove(start, empty, first, data, 'filled')
	expect(cueAfterMove(one, first, empty, data, 'cleared')).toEqual({ phase: 'mark' })
	const two = cueAfterMove(one, first, second, data, 'filled')
	expect(
		cueAfterMove(two, second, grid('empty', 'filled', 'empty', 'empty'), data, 'cleared')?.phase,
	).toBe('quiet')
	const interveningAction = cueAfterMove(one, first, first, data, undefined)
	expect(cueAfterMove(interveningAction, first, empty, data, 'cleared')?.phase).toBe('quiet')
})

test('a newly contradicted public clue triggers without disclosing or changing any square', () => {
	const wrong = grid('empty', 'empty', 'empty', 'filled')
	const cue = cueAfterMove(start, empty, wrong, data, 'filled')
	expect(cue).toEqual({ phase: 'mark' })
	expect(createTranslator('en-US')('games.nonogram.switchToMark')).toBe(
		'Switch to Mark for empty squares.',
	)
	expect(wrong[0][3]).toBe('filled')
	expect(cueAfterMove(cue, wrong, empty, data, 'cleared')).toBeUndefined()
	expect(cueAfterMove(undefined, empty, wrong, data, 'filled')).toBeUndefined()
	expect(
		cueAfterMove(start, wrong, grid('filled', 'empty', 'empty', 'filled'), data, 'filled')?.phase,
	).toBe('mode')
})
