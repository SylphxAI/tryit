import { describe, expect, it } from 'bun:test'
import { brushCell, createBrush, strokeCells } from './brush'

describe('Paint strokes', () => {
	it('keeps one ink for a gesture through occupied cells and revisits', () => {
		const fill = createBrush('empty', 'filled')
		const mark = createBrush('empty', 'marked')
		expect(brushCell(brushCell('empty', fill), fill)).toBe('filled')
		expect(brushCell('marked', fill)).toBe('filled')
		expect(brushCell('empty', mark)).toBe('marked')
		expect(brushCell('marked', mark)).toBe('marked')
	})

	it('erases only the starting ink and preserves the opposite ink for alternate strokes', () => {
		const erase = createBrush('marked', 'marked')
		expect(brushCell('marked', erase)).toBe('empty')
		expect(brushCell('empty', erase)).toBe('empty')
		expect(brushCell('filled', erase)).toBe('filled')
		const alternate = createBrush('filled', 'marked', true)
		expect(brushCell('filled', alternate)).toBe('filled')
		expect(brushCell('empty', alternate)).toBe('marked')
	})

	it('fills skipped cells in both directions and includes the endpoint', () => {
		expect(strokeCells({ row: 2, col: 0 }, { row: 2, col: 3 })).toEqual([
			{ row: 2, col: 1 },
			{ row: 2, col: 2 },
			{ row: 2, col: 3 },
		])
		expect(strokeCells({ row: 3, col: 3 }, { row: 1, col: 1 })).toEqual([
			{ row: 2, col: 2 },
			{ row: 1, col: 1 },
		])
	})
})
