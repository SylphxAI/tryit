/**
 * Queens Game Types
 * N-Queens puzzle with colored regions
 *
 * Rules:
 * 1. Place exactly one queen in each row
 * 2. Place exactly one queen in each column
 * 3. Place exactly one queen in each colored region
 * 4. Queens cannot touch each other (including diagonally)
 */

export type QueensCell = {
	hasQueen: boolean
	region: number // Color region index (0-N)
}

export type QueensPuzzleData = {
	size: number // Grid size (5-9 depending on difficulty)
	regions: number[][] // Grid of region indices
}

export type QueensSolution = {
	queens: [number, number][] // Array of [row, col] positions
}

export type QueensGuess = {
	row: number
	col: number
	place: boolean // true = place queen, false = remove queen
}

export type QueensGuessResult = {
	valid: boolean
	conflicts?: { row: number; col: number }[] // Conflicting cells
}

export type QueensGameState = {
	// Grid state
	grid: boolean[][] // true = queen placed
	selectedCell: { row: number; col: number } | null

	// Game progress
	isComplete: boolean
	startTime: number | null
	endTime: number | null
}

// Region colors for visualization
/** The brand's pastel fields: distinct regions, the same in light and dark. */
export const REGION_COLORS = [
	'bg-[#f0aba3]',
	'bg-[#aec6f2]',
	'bg-[#a8d5b5]',
	'bg-[#f5d36b]',
	'bg-[#c6b9f2]',
	'bg-[#f3b8d0]',
	'bg-[#f5bd8e]',
	'bg-[#a6d8dd]',
	'bg-[#cfe39a]',
]

export const conflictReasons = ['sameRow', 'sameColumn', 'sameRegion', 'diagonalTouch'] as const
export type ConflictReason = (typeof conflictReasons)[number]

/** Check which rules a queen at (row, col) would break. */
export function getConflicts(
	grid: boolean[][],
	regions: number[][],
	row: number,
	col: number,
): Set<ConflictReason> {
	const reasons = new Set<ConflictReason>()
	for (let r = 0; r < grid.length; r++) {
		for (let c = 0; c < grid.length; c++) {
			if (!grid[r][c] || (r === row && c === col)) continue
			if (r === row) reasons.add('sameRow')
			if (c === col) reasons.add('sameColumn')
			if (regions[r][c] === regions[row][col]) reasons.add('sameRegion')
			if (Math.abs(r - row) === 1 && Math.abs(c - col) === 1) reasons.add('diagonalTouch')
		}
	}
	return reasons
}

/**
 * Check if the puzzle is solved correctly
 */
export function isSolved(grid: boolean[][], regions: number[][], size: number): boolean {
	// Count queens
	let queenCount = 0
	for (let r = 0; r < size; r++) {
		for (let c = 0; c < size; c++) {
			if (grid[r][c]) queenCount++
		}
	}

	// Must have exactly N queens
	if (queenCount !== size) return false

	// Check each queen has no conflicts
	for (let r = 0; r < size; r++) {
		for (let c = 0; c < size; c++) {
			if (grid[r][c]) {
				const conflicts = getConflicts(grid, regions, r, c)
				if (conflicts.size > 0) return false
			}
		}
	}

	// Check each row has exactly one queen
	for (let r = 0; r < size; r++) {
		let count = 0
		for (let c = 0; c < size; c++) {
			if (grid[r][c]) count++
		}
		if (count !== 1) return false
	}

	// Check each column has exactly one queen
	for (let c = 0; c < size; c++) {
		let count = 0
		for (let r = 0; r < size; r++) {
			if (grid[r][c]) count++
		}
		if (count !== 1) return false
	}

	// Check each region has exactly one queen
	// First, collect all unique regions in the puzzle
	const allRegions = new Set<number>()
	for (let r = 0; r < size; r++) {
		for (let c = 0; c < size; c++) {
			allRegions.add(regions[r][c])
		}
	}

	// Count queens per region
	const regionCounts = new Map<number, number>()
	for (const region of allRegions) {
		regionCounts.set(region, 0)
	}
	for (let r = 0; r < size; r++) {
		for (let c = 0; c < size; c++) {
			if (grid[r][c]) {
				const region = regions[r][c]
				regionCounts.set(region, (regionCounts.get(region) || 0) + 1)
			}
		}
	}

	// Each region must have exactly one queen
	for (const count of regionCounts.values()) {
		if (count !== 1) return false
	}

	return true
}
