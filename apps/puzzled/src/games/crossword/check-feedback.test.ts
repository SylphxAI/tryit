import { expect, test } from 'bun:test'
import { incorrectCells } from './check-feedback'

test('decodes only the authority’s in-range cell mask', () => {
	expect(incorrectCells('crossword_incorrect_cells:33')).toBe((1 << 5) | 1)
	expect(incorrectCells('crossword_incorrect_cells:33554432')).toBe(0)
	expect(incorrectCells('crossword_incorrect_cells:3 ')).toBe(0)
	expect(incorrectCells('Try again')).toBe(0)
})
