import { getWordList } from './dictionary'
import { isOneLetterChange } from './types'

/** Immediate feedback only; SubmitGuess is still the authority on finishes. */
export function checkLadderStep(path: readonly string[], word: string, wordLength: number) {
	if (!getWordList().has(word)) return 'notInList'
	if (word.length !== wordLength) return 'wrongLength'
	const lastWord = path.at(-1)
	if (!lastWord || !isOneLetterChange(lastWord, word)) return 'notOneChange'
	if (path.includes(word)) return 'alreadyUsed'
	return null
}
