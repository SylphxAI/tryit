import { WORD_LENGTH } from './types'

export type Feedback = 'correct' | 'present' | 'absent'

const priority: Record<Feedback, number> = { absent: 1, present: 2, correct: 3 }

/** Decode only per-tile grades, never arbitrary data from the response. */
export function readWordFeedback(value: unknown): Feedback[] | undefined {
	if (!Array.isArray(value) || value.length !== WORD_LENGTH) return undefined
	const grades: Feedback[] = []
	for (const grade of value) {
		if (grade !== 'correct' && grade !== 'present' && grade !== 'absent') return undefined
		grades.push(grade)
	}
	return grades
}

export function wordKeyFeedback(rows: readonly { word: string; tiles: Feedback[] }[]) {
	const keys: Partial<Record<string, Feedback>> = {}
	for (const { word, tiles } of rows) {
		for (const [index, letter] of Array.from(word.toUpperCase()).entries()) {
			const grade = tiles[index]
			const previous = keys[letter]
			if (grade && (!previous || priority[grade] > priority[previous])) keys[letter] = grade
		}
	}
	return keys
}
