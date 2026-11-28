import { findClueMismatches } from './mismatch'
import type { CellState, NonogramPuzzleData } from './types'

export type FillEdit = 'filled' | 'cleared' | undefined
export type ModeCue = { phase: 'mode' | 'quiet' | 'mark'; lastFill?: number } | undefined

export function initialModeCue(day: string, seenDay: string | null): ModeCue {
	return seenDay === day ? undefined : { phase: 'mode' }
}

function singleChangedSquare(before: CellState[][], after: CellState[][], width: number) {
	let square: number | undefined
	for (const [row, line] of after.entries()) {
		if (line === before[row]) continue
		for (const [col, cell] of line.entries()) {
			if (cell === before[row][col]) continue
			if (square !== undefined) return undefined
			square = row * width + col
		}
	}
	return square
}

/** A new contradiction of a public clue, or immediately clearing your own Fill. Never the answer. */
export function cueAfterMove(
	cue: ModeCue,
	before: CellState[][],
	after: CellState[][],
	data: NonogramPuzzleData,
	edit: FillEdit,
): ModeCue {
	if (!cue) return cue
	if (before === after) return { phase: cue.phase }
	const square = edit && singleChangedSquare(before, after, data.width)
	const next = findClueMismatches(after, data)
	const consistent = !next.rows.length && !next.columns.length
	if (cue.phase === 'mark') return consistent ? undefined : cue
	if (edit === 'cleared' && square !== undefined && square === cue.lastFill)
		return { phase: 'mark' }
	if (edit === 'filled' && !consistent) {
		const previous = findClueMismatches(before, data)
		if (
			next.rows.some((row) => !previous.rows.includes(row)) ||
			next.columns.some((col) => !previous.columns.includes(col))
		)
			return { phase: 'mark' }
	}
	// Once the intro has done its job, silently watch for a mistake on this visit.
	return {
		phase: consistent ? 'quiet' : cue.phase,
		lastFill: edit === 'filled' ? square : undefined,
	}
}
