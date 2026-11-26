import { describe, expect, test } from 'bun:test'
import { parseGrade, parseReveal, parseWordGroupsClientPayload } from './parse-client'
import type { Category } from './types'

const words = Array.from({ length: 16 }, (_, i) => `WORD${i}`)

describe('parseWordGroupsClientPayload', () => {
	test('accepts the GetDaily wire form (groups stay on the server)', () => {
		expect(
			parseWordGroupsClientPayload({
				words,
				maxMistakes: 4,
				wordsPerCategory: 4,
				totalCategories: 4,
			}),
		).toEqual(words)
	})

	test('accepts the legacy wrapped form and drops the solution', () => {
		const parsed = parseWordGroupsClientPayload({
			puzzleData: { words },
			solution: { categories: [{ name: 'secret', words: words.slice(0, 4), level: 0 }] },
		})
		expect(parsed).toEqual(words)
		expect(JSON.stringify(parsed)).not.toContain('secret')
	})

	test('rejects a payload without sixteen words', () => {
		expect(() => parseWordGroupsClientPayload({ words: words.slice(0, 4) })).toThrow('sixteen')
		expect(() => parseWordGroupsClientPayload(null)).toThrow()
	})
})

const fruit: Category = { name: 'Fruit', words: ['APPLE', 'PEAR', 'PLUM', 'FIG'], level: 0 }
const correct = { correct: true, oneAway: false, category: fruit }

describe('parseGrade', () => {
	test('accepts a correct grade for the submitted words in any order', () => {
		expect(parseGrade(correct, [...fruit.words].reverse(), [])).toEqual({
			category: fruit,
			oneAway: false,
		})
	})

	test('preserves one-away feedback without exposing a category for an incorrect guess', () => {
		expect(parseGrade({ ...correct, correct: false, oneAway: true }, fruit.words, [])).toEqual({
			oneAway: true,
		})
	})

	test('rejects a grade with missing feedback', () => {
		expect(() => parseGrade({ correct: false }, fruit.words, [])).toThrow('invalid_group_grade')
	})

	test('rejects a correct grade that does not match the guess or was already solved', () => {
		expect(() => parseGrade(correct, ['APPLE', 'PEAR', 'PLUM', 'RED'], [])).toThrow(
			'invalid_group_grade',
		)
		expect(() => parseGrade(correct, fruit.words, [fruit])).toThrow('invalid_group_grade')
	})
})

const categories: Category[] = [
	fruit,
	{ name: 'Colors', words: ['RED', 'BLUE', 'GREEN', 'PINK'], level: 1 },
	{ name: 'Pets', words: ['DOG', 'CAT', 'RABBIT', 'HAMSTER'], level: 2 },
	{ name: 'Trees', words: ['OAK', 'ELM', 'ASH', 'BIRCH'], level: 3 },
]

describe('parseReveal', () => {
	test('accepts a reveal with all four valid categories', () => {
		expect(parseReveal(JSON.stringify({ categories }))).toEqual(categories)
	})

	test('ignores missing, malformed, or incomplete reveals', () => {
		expect(parseReveal(undefined)).toEqual([])
		expect(parseReveal('{')).toEqual([])
		expect(parseReveal(JSON.stringify({ categories: [fruit] }))).toEqual([])
	})

	test('ignores the entire reveal if a category contains duplicate words', () => {
		const invalid = { ...fruit, words: ['APPLE', 'APPLE', 'PLUM', 'FIG'] }
		expect(parseReveal(JSON.stringify({ categories: [invalid, ...categories.slice(1)] }))).toEqual(
			[],
		)
	})
})
