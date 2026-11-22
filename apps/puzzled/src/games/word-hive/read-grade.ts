import type { WordHiveGrade } from './types'

function isCount(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

export function readHiveGrade(value: unknown): WordHiveGrade | null {
	if (!value || typeof value !== 'object') return null
	const { valid, pangram, totalWords, totalPangrams } = value as Partial<WordHiveGrade>
	if (
		typeof valid !== 'boolean' ||
		typeof pangram !== 'boolean' ||
		!isCount(totalWords) ||
		!isCount(totalPangrams) ||
		totalPangrams > totalWords ||
		(valid && totalWords === 0) ||
		(pangram && (!valid || totalPangrams === 0))
	) {
		return null
	}
	return { valid, pangram, totalWords, totalPangrams }
}
