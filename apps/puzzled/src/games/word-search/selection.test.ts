import { describe, expect, it } from 'bun:test'
import { matchSelection } from './selection'

const grid = ['CAT', 'BAR', 'OWL'].map((row) => [...row])
const words = ['CAT', 'OWL']
const origin = { row: 0, col: 0 }
const lastLetter = { row: 0, col: 2 }

describe('Hunt selections', () => {
	it('finds new listed words in either direction', () => {
		expect(matchSelection(grid, words, new Map(), origin, lastLetter)).toEqual({
			kind: 'new',
			word: 'CAT',
		})
		expect(matchSelection(grid, words, new Map(), lastLetter, origin)).toEqual({
			kind: 'new',
			word: 'CAT',
		})
	})
	it('rejects crooked selections and straight unlisted letters', () => {
		expect(matchSelection(grid, words, new Map(), origin, { row: 1, col: 2 })).toEqual({
			kind: 'invalid',
		})
		expect(matchSelection(grid, words, new Map(), { row: 1, col: 0 }, { row: 1, col: 2 })).toEqual({
			kind: 'invalid',
		})
	})
	it('does not call a repeat selection invalid', () => {
		expect(matchSelection(grid, words, new Map([['CAT', true]]), origin, lastLetter)).toEqual({
			kind: 'already-found',
		})
	})
})
