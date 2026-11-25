import { describe, expect, test } from 'bun:test'
import { framePoints, framePolyline } from './frame-path'
import { getFrameSelection, hasValidSideTransitions, type LetterBox } from './types'

const box: LetterBox = {
	top: ['A', 'B', 'C'],
	right: ['D', 'E', 'F'],
	bottom: ['G', 'H', 'I'],
	left: ['J', 'K', 'L'],
}

describe('Frame path', () => {
	const points = framePoints(box)

	test('maps every position in DOM reading order onto the 100 × 100 perimeter', () => {
		expect(points).toEqual(
			new Map([
				['A', [17, 0]],
				['B', [50, 0]],
				['C', [83, 0]],
				['D', [100, 17]],
				['E', [100, 50]],
				['F', [100, 83]],
				['G', [17, 100]],
				['H', [50, 100]],
				['I', [83, 100]],
				['J', [0, 17]],
				['K', [0, 50]],
				['L', [0, 83]],
			]),
		)
	})

	test('joins letters in word order and preserves revisits', () => {
		expect(framePolyline('AHFJA', points)).toBe('17,0 50,100 100,83 0,17 17,0')
	})

	test('does not draw empty, single-letter or unresolvable paths', () => {
		for (const word of ['', 'B', 'AZH']) {
			expect(framePolyline(word, points)).toBeUndefined()
		}
	})
})

describe('Frame selection', () => {
	test('starts and resets with neither a highlight nor a locked side', () => {
		expect(getFrameSelection(box, true, '', undefined)).toEqual({
			anchor: undefined,
			lockedSide: undefined,
		})
	})

	test('a committed word highlights its last letter but does not lock a side yet', () => {
		expect(getFrameSelection(box, true, '', 'H')).toEqual({ anchor: 'H', lockedSide: undefined })
	})

	test('typing, backspace and undo track the draft end instead of the required start', () => {
		expect(getFrameSelection(box, true, 'HJ', 'H')).toEqual({ anchor: 'J', lockedSide: 'left' })
		expect(getFrameSelection(box, true, 'H', 'H')).toEqual({ anchor: 'H', lockedSide: 'bottom' })
		expect(getFrameSelection(box, true, 'AHJ', undefined)).toEqual({
			anchor: 'J',
			lockedSide: 'left',
		})
		expect(hasValidSideTransitions(box, 'HJK')).toBe(false)
		expect(hasValidSideTransitions(box, 'HJA')).toBe(true)
	})

	test('suppresses both cues while finishing, after acceptance, or after a failed finish', () => {
		expect(getFrameSelection(box, false, '', 'H')).toEqual({})
		expect(getFrameSelection(box, false, 'HJ', 'H')).toEqual({})
	})
})
