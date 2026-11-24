import { describe, expect, it } from 'bun:test'
import { slide, undoSlide } from './move-history'
import type { Block } from './types'

const start: Block[] = [
	{ id: 'a', x: 0, y: 0, width: 1, height: 1, isTarget: true },
	{ id: 'b', x: 1, y: 0, width: 1, height: 1, isTarget: false },
]

describe('Slides history', () => {
	it('does not record a wall hit or collision as a move', () => {
		const history = [start]
		expect(slide(history, 'a', 'left', 3, 3)).toBeUndefined()
		expect(slide(history, 'a', 'right', 3, 3)).toBeUndefined()
		expect(undoSlide(history)).toBeUndefined()
	})
	it('undoes one legal step and restores the prior board and move count', () => {
		const first = slide([start], 'a', 'down', 3, 3)!
		const second = slide(first, 'a', 'right', 3, 3)!
		expect(second).toHaveLength(3)
		expect(second[2][0]).toMatchObject({ x: 1, y: 1 })
		const previous = undoSlide(second)!
		expect(previous).toHaveLength(2)
		expect(previous[1][0]).toMatchObject({ x: 0, y: 1 })
		expect(undoSlide(previous)).toEqual([start])
		expect(start[0]).toMatchObject({ x: 0, y: 0 })
	})
})
