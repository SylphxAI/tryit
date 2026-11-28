import { CAGE_SUDOKU_CUE_SEEN_KEY } from '@/lib/storage-keys'
import type { KillerSudokuAction } from './state'
import { type Cage, getCellConflicts, type KillerSudokuGameState } from './types'

export const cageAnchor = ({ cells }: Cage) => Math.min(...cells.map(([row, col]) => 9 * row + col))

/** Count unordered sets of distinct digits using only a cage's printed clues. */
export function digitSetCount(size: number, total: number, digit = 1): number {
	if (size === 0) return Number(total === 0)
	if (digit > 9 || total < digit) return 0
	return digitSetCount(size - 1, total - digit, digit + 1) + digitSetCount(size, total, digit + 1)
}

export function firstMoveCage(cages: Cage[], canPlace: (row: number, col: number) => boolean) {
	return cages
		.flatMap((cage, index) =>
			cage.cells.some(([row, col]) => canPlace(row, col))
				? [
						{
							index,
							size: cage.cells.length,
							sets: digitSetCount(cage.cells.length, cage.sum),
							anchor: cageAnchor(cage),
						},
					]
				: [],
		)
		.sort((a, b) => a.size - b.size || a.sets - b.sets || a.anchor - b.anchor)[0]?.index
}

export function canShowFirstMoveCue(
	playingDaily: boolean,
	storage: () => Pick<Storage, 'getItem'>,
) {
	if (!playingDaily) return false
	try {
		return storage().getItem(CAGE_SUDOKU_CUE_SEEN_KEY) !== '1'
	} catch {
		return false // If persistence is unavailable, don't repeatedly interrupt play.
	}
}

export function markFirstMoveCueSeen(storage: () => Pick<Storage, 'setItem'>) {
	try {
		storage().setItem(CAGE_SUDOKU_CUE_SEEN_KEY, '1')
	} catch {
		// A failed write must never stop play or dismissal.
	}
}

/** Use the same visible conflicts as the grid, never solution correctness. */
export function isFirstMove(
	action: KillerSudokuAction,
	before: KillerSudokuGameState,
	after: KillerSudokuGameState,
	cages: Cage[],
): boolean {
	if (action.type !== 'SET_VALUE' || before.notesMode || !before.selectedCell) return false
	const [row, col] = before.selectedCell
	return (
		before.cells[row][col].value !== after.cells[row][col].value &&
		getCellConflicts(after.cells, cages, row, col).size === 0
	)
}
