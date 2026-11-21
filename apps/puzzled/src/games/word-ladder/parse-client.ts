/**
 * Client parser for GetDaily word-ladder payloads.
 *
 * The server serves `{ startWord, endWord, wordLength, minSteps }` with the
 * solution path stripped. The legacy wrapped `{ puzzleData, solution }` shape
 * is accepted and its path dropped: the browser judges each step by the rules
 * (a dictionary word one letter from the last), and the server validates the
 * finished path.
 */

import type { WordLadderPuzzleData } from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function parseWordLadderClientPayload(data: unknown): WordLadderPuzzleData {
	if (!isRecord(data)) throw new Error('[word-ladder] invalid puzzle payload')
	const inner = isRecord(data.puzzleData) ? data.puzzleData : data
	const startWord = typeof inner.startWord === 'string' ? inner.startWord.toLowerCase() : ''
	const endWord = typeof inner.endWord === 'string' ? inner.endWord.toLowerCase() : ''
	if (
		!/^[a-z]{3,5}$/.test(startWord) ||
		!/^[a-z]{3,5}$/.test(endWord) ||
		startWord === endWord ||
		startWord.length !== endWord.length
	) {
		throw new Error('[word-ladder] distinct, equal-length start and end words are required')
	}
	if (inner.wordLength !== undefined && inner.wordLength !== startWord.length) {
		throw new Error('[word-ladder] invalid word length')
	}
	const minSteps = inner.minSteps === undefined ? 1 : inner.minSteps
	if (typeof minSteps !== 'number' || !Number.isSafeInteger(minSteps) || minSteps < 1) {
		throw new Error('[word-ladder] invalid minimum steps')
	}
	return { startWord, endWord, wordLength: startWord.length, minSteps }
}
