import { describe, expect, test } from 'bun:test'
import { parseResultPattern } from '@/features/daily/lib/result-card'
import { wordHiveSharePattern } from './share-pattern'

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`)

describe('wordHiveSharePattern', () => {
	test('one square per found word in order, yellow for a pangram, ten per row', () => {
		const found = [...words(4), 'pangramx', ...words(8).slice(4), 'pangramy', 'last']
		const text = wordHiveSharePattern(found, ['pangramy', 'pangramx'])
		expect(text).toBe('🟩🟩🟩🟩🟨🟩🟩🟩🟩🟨\n🟩')
		expect(parseResultPattern(text, 'word-hive')).toEqual([
			['hit', 'hit', 'hit', 'hit', 'near', 'hit', 'hit', 'hit', 'hit', 'near'],
			['hit'],
		])
	})

	test('carries no letters, digits or word lengths', () => {
		const short = wordHiveSharePattern(['abcd', 'abcdefgh'], ['abcdefgh'])
		const long = wordHiveSharePattern(['abcdefghijkl', 'abcdefgh'], ['abcdefgh'])
		expect(short).toBe(long)
		expect(short).not.toMatch(/[\p{L}\p{N}]/u)
	})

	test('falls back to no grid for an unknown, inconsistent or oversized run', () => {
		expect(wordHiveSharePattern([], [])).toBe('')
		expect(wordHiveSharePattern(['word0'], ['missing'])).toBe('')
		expect(wordHiveSharePattern(words(121), [])).toBe('')
		expect(wordHiveSharePattern(words(120), []).split('\n')).toHaveLength(12)
	})
})
