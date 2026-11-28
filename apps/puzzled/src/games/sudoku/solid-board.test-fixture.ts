import { createComponent } from 'solid-js'
import { render } from 'solid-js/web'
import SudokuBoard from './solid-board'

export function mountSudoku(host: HTMLElement) {
	const grid = Array.from({ length: 9 }, () => Array<number | null>(9).fill(null))
	grid[0][0] = 3
	return render(
		() =>
			createComponent(SudokuBoard, {
				puzzle: {
					kind: 'playable',
					puzzleDate: '',
					puzzleId: '',
					puzzleData: { grid, difficulty: 'easy' },
				},
				locale: 'en-US',
				onAlreadyPlayed() {},
			}),
		host,
	)
}
