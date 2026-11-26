export type CategoryLevel = 0 | 1 | 2 | 3 // 0=easiest (rose), 3=hardest (ochre)

export type Category = {
	name: string
	words: string[]
	level: CategoryLevel
}

export const MAX_MISTAKES = 4
export const WORDS_PER_CATEGORY = 4
export const TOTAL_CATEGORIES = 4

/**
 * Puzzle data sent to client (shuffled words only, no category groupings)
 */
export type ConnectionsPuzzleData = {
	words: string[]
	maxMistakes: number
	wordsPerCategory: number
	totalCategories: number
}

/**
 * Solution stored server-side only
 */
export type ConnectionsSolution = {
	categories: Category[]
}

// Tryit's rose / teal / indigo / ochre bands keep ink text in both themes.
export const CATEGORY_COLORS = {
	0: { bg: 'bg-[#efa0bb]', text: 'text-[#1a1712]' },
	1: { bg: 'bg-[#72d3c4]', text: 'text-[#1a1712]' },
	2: { bg: 'bg-[#a9a4ee]', text: 'text-[#1a1712]' },
	3: { bg: 'bg-[#d8ad61]', text: 'text-[#1a1712]' },
} satisfies Record<CategoryLevel, { bg: string; text: string }>
