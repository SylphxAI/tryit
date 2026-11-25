/**
 * Tango Game Types
 * Binary puzzle game (Sun/Moon balance)
 *
 * Rules:
 * 1. Each row has equal suns (☀️) and moons (🌙)
 * 2. Each column has equal suns and moons
 * 3. No more than 2 consecutive same symbols
 * 4. All rows must be unique
 * 5. All columns must be unique
 */

export type CellValue = 'sun' | 'moon' | null

export type TangoCell = {
	value: CellValue
	isGiven: boolean // Pre-filled cells
}

export type TangoPuzzleData = {
	size: number // Grid size (must be even, typically 6)
	initialGrid: CellValue[][] // Pre-filled cells
}

export type TangoSolution = {
	grid: ('sun' | 'moon')[][]
}

export type TangoGuessInput = {
	row: number
	col: number
	value: CellValue
}

export type TangoGuessResult = {
	valid: boolean
	conflicts?: { row: number; col: number }[]
	error?: string
}

export type TangoGameState = {
	grid: TangoCell[][]
	size: number
	gameStatus: 'playing' | 'won' | 'lost'
	startTime: number | null
	endTime: number | null
}

export const DEFAULT_SIZE = 6
export const MAX_CONSECUTIVE = 2

type ConflictCell = { row: number; col: number }

/** Cell coordinates are zero-based; row and column groups are one-based for display. */
export type TangoConflictDetails = {
	cells: ConflictCell[]
	consecutive: boolean
	imbalance: boolean
	duplicateRows: number[][]
	duplicateColumns: number[][]
}

function duplicateGroups(lines: CellValue[][]): number[][] {
	const groups = new Map<string, number[]>()
	for (const [index, line] of lines.entries()) {
		if (line.includes(null)) continue
		const key = line.join(',')
		const group = groups.get(key)
		if (group) group.push(index + 1)
		else groups.set(key, [index + 1])
	}
	return [...groups.values()].filter((group) => group.length > 1)
}

export function getConflictDetails(grid: TangoCell[][]): TangoConflictDetails {
	const cells = new Map<number, ConflictCell>()
	const size = grid.length
	const rows = grid.map((row) => row.map(({ value }) => value))
	const columns = Array.from({ length: size }, (_, col) => rows.map((row) => row[col]))
	let consecutive = false
	let imbalance = false

	function mark(row: number, col: number) {
		cells.set(row * size + col, { row, col })
	}

	for (let r = 0; r < size; r++) {
		for (let c = 0; c < size; c++) {
			if (hasConsecutiveViolationAt(grid, r, c)) {
				consecutive = true
				mark(r, c)
			}
		}
	}

	function markUnbalanced(lines: CellValue[][], markCell: (line: number, offset: number) => void) {
		for (const [index, line] of lines.entries()) {
			const suns = line.filter((value) => value === 'sun').length
			const moons = line.filter((value) => value === 'moon').length
			if (suns <= size / 2 && moons <= size / 2) continue
			imbalance = true
			for (let offset = 0; offset < size; offset++) {
				if (line[offset]) markCell(index, offset)
			}
		}
	}
	markUnbalanced(rows, mark)
	markUnbalanced(columns, (col, row) => mark(row, col))

	const duplicateRows = duplicateGroups(rows)
	const duplicateColumns = duplicateGroups(columns)
	for (const group of duplicateRows) {
		for (const row of group) {
			for (let col = 0; col < size; col++) mark(row - 1, col)
		}
	}
	for (const group of duplicateColumns) {
		for (const col of group) {
			for (let row = 0; row < size; row++) mark(row, col - 1)
		}
	}

	return { cells: [...cells.values()], consecutive, imbalance, duplicateRows, duplicateColumns }
}

export function getConflicts(grid: TangoCell[][]): ConflictCell[] {
	return getConflictDetails(grid).cells
}

/**
 * Check consecutive violation at a specific position
 */
function hasConsecutiveViolationAt(grid: TangoCell[][], row: number, col: number): boolean {
	const value = grid[row][col].value
	if (!value) return false

	const size = grid.length

	// Check horizontal: 3 in a row
	if (col >= 2 && grid[row][col - 1].value === value && grid[row][col - 2].value === value) {
		return true
	}
	if (
		col >= 1 &&
		col < size - 1 &&
		grid[row][col - 1].value === value &&
		grid[row][col + 1].value === value
	) {
		return true
	}
	if (col < size - 2 && grid[row][col + 1].value === value && grid[row][col + 2].value === value) {
		return true
	}

	// Check vertical: 3 in a row
	if (row >= 2 && grid[row - 1][col].value === value && grid[row - 2][col].value === value) {
		return true
	}
	if (
		row >= 1 &&
		row < size - 1 &&
		grid[row - 1][col].value === value &&
		grid[row + 1][col].value === value
	) {
		return true
	}
	if (row < size - 2 && grid[row + 1][col].value === value && grid[row + 2][col].value === value) {
		return true
	}

	return false
}

/**
 * Check if the puzzle is solved correctly
 */
export function isSolved(grid: TangoCell[][]): boolean {
	const size = grid.length
	const halfSize = size / 2

	// Check all cells are filled
	for (let r = 0; r < size; r++) {
		for (let c = 0; c < size; c++) {
			if (!grid[r][c].value) return false
		}
	}

	// Check no conflicts
	if (getConflicts(grid).length > 0) return false

	// Check each row has equal suns and moons
	for (let r = 0; r < size; r++) {
		const sunCount = grid[r].filter((cell) => cell.value === 'sun').length
		const moonCount = grid[r].filter((cell) => cell.value === 'moon').length
		if (sunCount !== halfSize || moonCount !== halfSize) return false
	}

	// Check each column has equal suns and moons
	for (let c = 0; c < size; c++) {
		const sunCount = grid.filter((row) => row[c].value === 'sun').length
		const moonCount = grid.filter((row) => row[c].value === 'moon').length
		if (sunCount !== halfSize || moonCount !== halfSize) return false
	}

	// Check row uniqueness
	const rowStrings = new Set<string>()
	for (let r = 0; r < size; r++) {
		const rowStr = grid[r].map((cell) => cell.value).join('')
		if (rowStrings.has(rowStr)) return false
		rowStrings.add(rowStr)
	}

	// Check column uniqueness
	const colStrings = new Set<string>()
	for (let c = 0; c < size; c++) {
		const colStr = grid.map((row) => row[c].value).join('')
		if (colStrings.has(colStr)) return false
		colStrings.add(colStr)
	}

	return true
}
