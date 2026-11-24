import type { CellState } from './types'

export type Cell = { row: number; col: number }
type Ink = Exclude<CellState, 'empty'>
type Brush = { ink: Ink; target: CellState; alternate: boolean }

export function createBrush(start: CellState, ink: Ink, alternate = false): Brush {
	return { ink, target: start === ink ? 'empty' : ink, alternate }
}

export function brushCell(current: CellState, brush: Brush): CellState {
	// An erase stroke only erases its own ink. The alternate button never overwrites the other ink.
	if (
		current !== brush.ink &&
		(brush.target === 'empty' || (brush.alternate && current !== 'empty'))
	)
		return current
	return brush.target
}

// Fill skipped cells when two pointer samples arrive more than one cell apart.
export function strokeCells(from: Cell, to: Cell): Cell[] {
	const dr = to.row - from.row
	const dc = to.col - from.col
	const steps = Math.max(Math.abs(dr), Math.abs(dc))
	if (steps === 0) return [to]
	return Array.from({ length: steps }, (_, index) => ({
		row: Math.round(from.row + (dr * (index + 1)) / steps),
		col: Math.round(from.col + (dc * (index + 1)) / steps),
	}))
}
