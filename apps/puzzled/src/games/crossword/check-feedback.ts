import { GRID_SIZE } from './types'

/** Decode the authority's row-major 5×5 error mask. Other rejections are generic. */
export function incorrectCells(error: string): number {
	const match = /^crossword_incorrect_cells:(\d{1,8})$/.exec(error)
	const mask = Number(match?.[1] ?? 0)
	return mask < 2 ** (GRID_SIZE * GRID_SIZE) ? mask : 0
}
