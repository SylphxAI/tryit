import {
	type CrosswordClue,
	type CrosswordDirection,
	type CrosswordPuzzleClientData,
	type CrosswordState,
	hasDownClues,
} from './types'

export function inClue(
	clue: CrosswordClue,
	row: number,
	col: number,
	direction: CrosswordDirection,
) {
	return direction === 'across'
		? row === clue.row && col >= clue.col && col < clue.col + clue.length
		: col === clue.col && row >= clue.row && row < clue.row + clue.length
}

export function findActiveClue(state: CrosswordState, clues: CrosswordPuzzleClientData['clues']) {
	const { selectedCell, direction } = state
	if (!selectedCell) return undefined
	return clues[direction].find((clue) =>
		inClue(clue, selectedCell.row, selectedCell.col, direction),
	)
}

export function stepClue(
	state: CrosswordState,
	puzzleData: CrosswordPuzzleClientData,
	delta: 1 | -1,
): CrosswordState {
	const { clues } = puzzleData
	const ordered = clues.across.map<{ clue: CrosswordClue; direction: CrosswordDirection }>(
		(clue) => ({ clue, direction: 'across' }),
	)
	if (hasDownClues(clues)) {
		for (const clue of clues.down) ordered.push({ clue, direction: 'down' })
	}
	const count = ordered.length
	if (count <= 1) return state

	const active = findActiveClue(state, clues)
	const index = ordered.findIndex(
		({ clue, direction }) => clue === active && direction === state.direction,
	)
	const target = index < 0 ? (delta === 1 ? 0 : count - 1) : (index + delta + count) % count
	const { clue, direction } = ordered[target]
	let selectedCell = { row: clue.row, col: clue.col }
	if (puzzleData.grid[clue.row]?.[clue.col] == null) return state
	for (let offset = 0; offset < clue.length; offset++) {
		const row = clue.row + (direction === 'down' ? offset : 0)
		const col = clue.col + (direction === 'across' ? offset : 0)
		const letter = state.userGrid[row]?.[col]
		if (letter == null) break
		if (letter.trim() === '') {
			selectedCell = { row, col }
			break
		}
	}
	return { ...state, selectedCell, direction }
}
