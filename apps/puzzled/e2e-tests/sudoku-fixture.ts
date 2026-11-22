import type { Page } from '@playwright/test'
import sudokuGoldens from '../../../crates/puzzled-core/tests/fixtures/generate/sudoku.json'
import { productDayKey } from '../src/lib/product-day'

export async function serveSudoku(page: Page, { requiresStart = false } = {}) {
	const puzzleData = sudokuGoldens.find((puzzle) => puzzle.difficulty === 'easy')?.puzzleData
	if (!puzzleData) throw new Error('Missing easy Sudoku golden')
	const daily = { gameSlug: 'sudoku', puzzleDate: productDayKey(), canPlay: true }
	const playable = { ...daily, puzzleDataJson: JSON.stringify(puzzleData) }
	await page.route('**/puzzled.v1.PuzzleService/GetDaily', (route) =>
		route.fulfill({ json: requiresStart ? { ...daily, requiresStart } : playable }),
	)
	if (requiresStart) {
		await page.route('**/puzzled.v1.PuzzleService/StartDaily', (route) =>
			route.fulfill({ json: { daily: playable } }),
		)
	}
}
