import { getWordFromPositions, type Position } from './types'

type Match = { kind: 'invalid' } | { kind: 'already-found' } | { kind: 'new'; word: string }

export function matchSelection(
	grid: string[][],
	words: string[],
	found: ReadonlyMap<string, unknown>,
	start: Position,
	end: Position,
): Match {
	const text = getWordFromPositions(grid, start, end)?.toUpperCase()
	if (!text) return { kind: 'invalid' }
	const listed = [text, Array.from(text).reverse().join('')].filter((word) => words.includes(word))
	const word = listed.find((candidate) => !found.has(candidate))
	if (word) return { kind: 'new', word }
	return { kind: listed.length > 0 ? 'already-found' : 'invalid' }
}
