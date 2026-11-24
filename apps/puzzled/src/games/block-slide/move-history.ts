import { type Block, canMove, type Direction, moveBlock } from './types'

export function slide(
	history: Block[][],
	id: string,
	direction: Direction,
	width: number,
	height: number,
): Block[][] | undefined {
	const current = history[history.length - 1]
	if (!canMove(current, id, direction, width, height)) return
	return [...history, moveBlock(current, id, direction)]
}

export function undoSlide(history: Block[][]): Block[][] | undefined {
	if (history.length > 1) return history.slice(0, -1)
}
