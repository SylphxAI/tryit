import { describe, expect, test } from 'bun:test'
import { parseArithmoClientPayload, parseGrade, updateKeyboardStatus } from './feedback'

const equation = '12+34=46'

describe('Arithmo wire boundaries', () => {
	test('accepts only an eight-character board and discards legacy answer fields', () => {
		expect(parseArithmoClientPayload({ length: 8 })).toEqual({ length: 8 })
		expect(
			parseArithmoClientPayload({ puzzleData: { length: 8, equation }, solution: { equation } }),
		).toEqual({ length: 8 })
		expect(parseArithmoClientPayload({ length: 7 })).toBeNull()
	})

	test('reads only eight recognized grades, ignoring unsolicited answers', () => {
		const tiles = [
			'correct',
			'present',
			'correct',
			'absent',
			'absent',
			'correct',
			'present',
			'absent',
		]
		expect(parseGrade({ tiles, equation })).toEqual(tiles)
		expect(parseGrade({ tiles: [...tiles.slice(0, -1), 'empty'] })).toBeNull()
		expect(parseGrade({ tiles: tiles.slice(1) })).toBeNull()
		expect(parseGrade({ equation })).toBeNull()
	})

	test('retains the strongest feedback across duplicate characters and attempts', () => {
		const previous = { '1': 'present', '+': 'correct' } as const
		expect(
			updateKeyboardStatus(previous, '11++2', ['absent', 'correct', 'present', 'absent', 'absent']),
		).toEqual({ '1': 'correct', '+': 'correct', '2': 'absent' })
		expect(previous['1']).toBe('present')
	})
})
