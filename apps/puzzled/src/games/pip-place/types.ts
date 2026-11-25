/**
 * Spots game types
 * Place a complete double-n set so every region constraint holds.
 */

export type Cell = {
	row: number
	col: number
}

export type PipPlaceTile = {
	a: Cell
	b: Cell
	pa: number
	pb: number
}

export type RegionKind = 'sum' | 'equal' | 'unequal' | 'free'

export type PipPlaceRegion = {
	id: number
	kind: RegionKind
	value: number | null
}

export type PipPlaceRegionConflict = {
	regionId: number
	kind: Exclude<RegionKind, 'free'>
	target: number | null
	actualSum: number
	cells: Cell[]
}

export type PipPlacePuzzleData = {
	maxPip: number
	rows: number
	cols: number
	regionOf: number[][]
	regions: PipPlaceRegion[]
}

export type PipPlaceSolution = {
	tiles: PipPlaceTile[]
}

export type PipPlaceGuess = {
	cell: Cell
}

export type PipPlaceGuessResult = {
	valid: boolean
	error?: string
}

export type PipPlaceGameState = {
	placed: PipPlaceTile[]
	tray: PipPlaceTileFace[]
	selectedTrayIndex: number | null
	pending: Cell | null
	gameStatus: 'playing' | 'won'
	startTime: number | null
	endTime: number | null
}

export type PipPlaceTileFace = {
	pa: number
	pb: number
}

export const DAILY_MAX_PIP = 3
export const DAILY_ROWS = 4
export const DAILY_COLS = 5

export function cellKey(cell: Cell): string {
	return `${cell.row},${cell.col}`
}

export function cellsEqual(a: Cell, b: Cell): boolean {
	return a.row === b.row && a.col === b.col
}

export function isOrthogonalNeighbor(a: Cell, b: Cell): boolean {
	return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1
}

export function inBounds(cell: Cell, rows: number, cols: number): boolean {
	return cell.row >= 0 && cell.col >= 0 && cell.row < rows && cell.col < cols
}

/** Complete double-n set as sorted pairs (a <= b). */
export function doubleSet(maxPip: number): Array<[number, number]> {
	const out: Array<[number, number]> = []
	for (let a = 0; a <= maxPip; a++) {
		for (let b = a; b <= maxPip; b++) {
			out.push([a, b])
		}
	}
	return out
}

function sortedPair(a: number, b: number): string {
	return a <= b ? `${a},${b}` : `${b},${a}`
}

function isIntPip(value: number, maxPip: number): boolean {
	return Number.isInteger(value) && value >= 0 && value <= maxPip
}

/**
 * True when `tiles` is any covering that uses the complete double-n set
 * and satisfies every region constraint. Does not compare against stored tiles.
 */
export function isSolved(tiles: PipPlaceTile[], puzzle: PipPlacePuzzleData): boolean {
	const { maxPip, rows, cols, regionOf, regions } = puzzle
	if (!Number.isInteger(maxPip) || maxPip < 0) return false
	if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows <= 0 || cols <= 0) return false
	if (regionOf.length !== rows) return false
	for (const line of regionOf) {
		if (line.length !== cols) return false
	}

	const expected = doubleSet(maxPip)
	if (tiles.length !== expected.length) return false
	if (rows * cols !== expected.length * 2) return false

	const grid: Array<Array<number | null>> = Array.from({ length: rows }, () =>
		Array<number | null>(cols).fill(null),
	)

	const actualPairs: string[] = []
	for (const tile of tiles) {
		if (!tile) return false
		if (!inBounds(tile.a, rows, cols) || !inBounds(tile.b, rows, cols)) return false
		if (!isOrthogonalNeighbor(tile.a, tile.b)) return false
		if (!isIntPip(tile.pa, maxPip) || !isIntPip(tile.pb, maxPip)) return false
		if (grid[tile.a.row][tile.a.col] !== null) return false
		if (grid[tile.b.row][tile.b.col] !== null) return false
		grid[tile.a.row][tile.a.col] = tile.pa
		grid[tile.b.row][tile.b.col] = tile.pb
		actualPairs.push(sortedPair(tile.pa, tile.pb))
	}

	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			if (grid[r][c] === null) return false
		}
	}

	const expectedPairs = expected.map(([a, b]) => sortedPair(a, b)).sort()
	actualPairs.sort()
	if (expectedPairs.length !== actualPairs.length) return false
	for (let i = 0; i < expectedPairs.length; i++) {
		if (expectedPairs[i] !== actualPairs[i]) return false
	}

	const regionIds = new Set<number>()
	for (const region of regions) {
		if (!region || regionIds.has(region.id)) return false
		regionIds.add(region.id)
	}

	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			if (!regionIds.has(regionOf[r][c])) return false
		}
	}

	for (const region of regions) {
		const pips: number[] = []
		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				if (regionOf[r][c] === region.id) {
					const pip = grid[r][c]
					if (pip === null) return false
					pips.push(pip)
				}
			}
		}
		if (pips.length === 0) return false
		if (!regionHolds(region, pips)) return false
	}

	return true
}

/** Report only violated rules in regions whose cells are all covered. */
export function getRegionConflicts(
	placed: PipPlaceTile[],
	puzzle: PipPlacePuzzleData,
): PipPlaceRegionConflict[] {
	const placedPips = new Map<string, number>()
	for (const tile of placed) {
		placedPips.set(cellKey(tile.a), tile.pa)
		placedPips.set(cellKey(tile.b), tile.pb)
	}
	const coverage = new Map<number, { cells: Cell[]; pips: number[] }>()
	for (const [row, ids] of puzzle.regionOf.entries()) {
		for (const [col, id] of ids.entries()) {
			let region = coverage.get(id)
			if (!region) {
				region = { cells: [], pips: [] }
				coverage.set(id, region)
			}
			const cell = { row, col }
			region.cells.push(cell)
			const pip = placedPips.get(cellKey(cell))
			if (pip !== undefined) region.pips.push(pip)
		}
	}
	const conflicts: PipPlaceRegionConflict[] = []
	for (const region of puzzle.regions) {
		if (region.kind === 'free') continue
		const covered = coverage.get(region.id)
		if (!covered || covered.pips.length !== covered.cells.length) continue
		const { cells, pips } = covered
		if (!regionHolds(region, pips)) {
			conflicts.push({
				regionId: region.id,
				kind: region.kind,
				target: region.value,
				actualSum: sumPips(pips),
				cells,
			})
		}
	}
	return conflicts
}

export function getConflictDetails(
	placed: PipPlaceTile[],
	puzzle: PipPlacePuzzleData,
): { cells: Cell[]; regions: PipPlaceRegionConflict[] } {
	const regions = getRegionConflicts(placed, puzzle)
	return { cells: regions.flatMap((region) => region.cells), regions }
}

function sumPips(pips: number[]): number {
	return pips.reduce((total, pip) => total + pip, 0)
}

function regionHolds(region: PipPlaceRegion, pips: number[]): boolean {
	switch (region.kind) {
		case 'free':
			return true
		case 'sum': {
			if (region.value === null || !Number.isInteger(region.value)) return false
			return sumPips(pips) === region.value
		}
		case 'equal': {
			const first = pips[0]
			if (!pips.every((pip) => pip === first)) return false
			if (region.value !== null && region.value !== first) return false
			return true
		}
		case 'unequal': {
			return new Set(pips).size === pips.length
		}
		default:
			return false
	}
}
