import { expect, type Locator, type Page } from '@playwright/test'
import crowns from '../../../crates/puzzled-core/tests/fixtures/generate/crowns.json'
import duo from '../../../crates/puzzled-core/tests/fixtures/generate/duo.json'
import cage from '../../../crates/puzzled-core/tests/fixtures/generate/killer-sudoku.json'
import paint from '../../../crates/puzzled-core/tests/fixtures/generate/nonogram.json'
import path from '../../../crates/puzzled-core/tests/fixtures/generate/number-path.json'
import match from '../../../crates/puzzled-core/tests/fixtures/generate/pattern-match.json'
import spots from '../../../crates/puzzled-core/tests/fixtures/generate/pip-place.json'
import frame from '../../../crates/puzzled-core/tests/fixtures/generate/word-box.json'
import ladder from '../../../crates/puzzled-core/tests/fixtures/generate/word-ladder.json'

export interface FinishFixture {
	data: unknown
	board: string
	difficulty?: string
	grade?: (guess: Record<string, unknown>) => unknown
	win: (page: Page, stage: Locator) => Promise<void>
	lose?: (page: Page, stage: Locator) => Promise<void>
	reveal?: unknown
}

function cell(board: Locator, row: number, col: number) {
	return board.getByRole('button', {
		name: new RegExp(`^Row ${row + 1}, Column ${col + 1}(,|$)`),
	})
}

const sudoku = Array.from({ length: 9 }, (_, r) =>
	Array.from({ length: 9 }, (_, c) => ((r * 3 + Math.floor(r / 3) + c) % 9) + 1),
)
const cageCase = cage.find((entry) => entry.difficulty === 'medium' && entry.solution)!
const categories = [
	{ name: 'Fruit', words: ['APPLE', 'BANANA', 'ORANGE', 'GRAPE'], level: 0 },
	{ name: 'Colours', words: ['RED', 'BLUE', 'GREEN', 'YELLOW'], level: 1 },
	{ name: 'Planets', words: ['MARS', 'VENUS', 'SATURN', 'JUPITER'], level: 2 },
	{ name: 'Card suits', words: ['HEART', 'DIAMOND', 'CLUB', 'SPADE'], level: 3 },
]
const quadAnswers = ['NAVAL', 'ROCKY', 'PUNCH', 'LAUGH']

export const guestFinishFixtures = {
	'word-guess': {
		reveal: { word: 'COUCH' },
		lose: async (page, stage) => {
			for (const [i, word] of ['crane', 'raise', 'blush', 'flame', 'sugar', 'lemon'].entries()) {
				await page.keyboard.type(word)
				await page.keyboard.press('Enter')
				await expect(stage.locator('tr').nth(i).locator('[data-grade="absent"]')).toHaveCount(5)
			}
		},
		data: { wordLength: 5, maxAttempts: 6 },
		board: 'table',
		grade: ({ word }) => ({
			tiles:
				word === 'charm'
					? ['correct', 'present', 'absent', 'absent', 'absent']
					: Array(5).fill('correct'),
		}),
		win: async (page, stage) => {
			for (const [index, word] of ['charm', 'couch'].entries()) {
				await page.keyboard.type(word)
				await page.keyboard.press('Enter')
				await expect(stage.locator('tr').nth(index).locator('[data-grade]')).toHaveCount(5)
			}
		},
	},
	sudoku: {
		data: {
			grid: sudoku.map((row, r) => row.map((digit, c) => (r === 8 && c === 8 ? null : digit))),
			difficulty: 'easy',
		},
		difficulty: 'easy',
		board: '.play-board',
		win: async (page, stage) => {
			await cell(stage, 8, 8).click()
			await page.keyboard.press('8')
		},
	},
	crossword: {
		data: {
			grid: [['', '', '', '', ''], ...Array.from({ length: 4 }, () => Array(5).fill(null))],
			clues: { across: [{ number: 1, row: 0, col: 0, length: 5, clue: 'Pleasant' }], down: [] },
		},
		board: '.play-board',
		win: async (page, stage) => {
			await stage.locator('[data-crossword-cell]').first().click()
			await page.keyboard.type('NICER')
			await stage.getByRole('button', { name: 'Check', exact: true }).click()
		},
	},
	nonogram: {
		data: paint[0].puzzleData,
		difficulty: 'easy',
		board: '.play-board',
		win: async (_page, stage) => {
			for (const [r, line] of paint[0].solution!.grid.entries())
				for (const [c, fill] of line.entries()) if (fill) await cell(stage, r, c).click()
		},
	},
	'word-search': {
		data: {
			grid: [
				['C', 'A', 'T'],
				['P', 'I', 'G'],
				['Q', 'X', 'Z'],
			],
			words: ['CAT', 'PIG'],
		},
		board: 'fieldset',
		win: async (page, stage) => {
			for (const name of ['C, Row 1, Column 1', 'P, Row 2, Column 1']) {
				await stage.getByRole('button', { name, exact: true }).press('Enter')
				await page.keyboard.press('ArrowRight')
				await page.keyboard.press('ArrowRight')
				await page.keyboard.press('Enter')
			}
		},
	},
	'pattern-match': {
		lose: async (_page, stage) =>
			stage.getByRole('button', { name: 'Give Up', exact: true }).click(),
		data: match[0].puzzleData,
		board: 'fieldset',
		win: async (_page, stage) => {
			for (const trio of match[0].solution.validSets)
				for (const id of trio) await stage.locator(`[data-match-card="${id}"]`).click()
		},
	},
	crowns: {
		data: crowns[0].puzzleData,
		difficulty: 'easy',
		board: 'fieldset',
		win: async (_page, stage) => {
			for (const [r, c] of crowns[0].solution!.queens) await cell(stage, r, c).click()
		},
	},
	duo: {
		data: duo[0].puzzleData,
		board: 'fieldset',
		win: async (_page, stage) => {
			for (const [r, line] of duo[0].solution!.grid.entries()) {
				for (const [c, value] of line.entries()) {
					if (duo[0].puzzleData.initialGrid[r][c]) continue
					await cell(stage, r, c).click()
					if (value === 'moon') await cell(stage, r, c).click()
				}
			}
		},
	},
	'number-path': {
		data: path[0].puzzleData,
		board: '.play-board',
		win: async (_page, stage) => {
			for (const { row, col } of path[0].solution!.path) await cell(stage, row, col).click()
		},
	},
	'word-groups': {
		reveal: { categories },
		lose: async (_page, stage) => {
			for (const [i, planet] of categories[2].words.entries()) {
				for (const name of ['APPLE', 'RED', planet, 'HEART'])
					await stage.getByRole('button', { name, exact: true }).click()
				await stage.getByRole('button', { name: 'Submit', exact: true }).click()
				if (i < 3) await expect(stage.getByLabel(`${3 - i} of 4 mistakes remaining`)).toBeVisible()
			}
		},
		data: {
			words: categories.flatMap(({ words }) => words),
			maxMistakes: 4,
			wordsPerCategory: 4,
			totalCategories: 4,
		},
		// The word grid is replaced by solved category tiles, not moved intact.
		board: '.play-body > div',
		grade: ({ words }) => {
			const category = categories.find((category) =>
				category.words.every((word) => (words as string[]).includes(word)),
			)
			return { correct: !!category, oneAway: false, category }
		},
		win: async (_page, stage) => {
			for (const [i, { words }] of categories.entries()) {
				for (const name of words) await stage.getByRole('button', { name, exact: true }).click()
				await stage.getByRole('button', { name: 'Submit', exact: true }).click()
				await expect(stage.locator('[data-group-category]')).toHaveCount(i + 1)
			}
		},
	},
	'killer-sudoku': {
		data: cageCase.puzzleData,
		difficulty: 'medium',
		board: '.play-board',
		win: async (_page, stage) => {
			for (const [r, line] of cageCase.solution!.grid.entries())
				for (const [c, digit] of line.entries())
					if (cageCase.puzzleData!.grid[r][c] === null) await cell(stage, r, c).press(String(digit))
		},
	},
	'word-ladder': {
		data: ladder[0].puzzleData,
		board: '[data-ladder-path]',
		win: async (_page, stage) => {
			const input = stage.getByRole('textbox', { name: 'Enter a word...' })
			for (const word of ladder[0].solution.path.slice(1)) {
				await input.fill(word)
				await input.press('Enter')
			}
		},
	},
	cryptogram: {
		data: {
			encryptedText: 'AB, BA!',
			author: 'Fixture author',
			category: 'Fixture',
			uniqueLetters: 2,
			maxHints: 1,
		},
		board: '[data-cipher-quote]',
		grade: ({ guesses }) => ({
			solved:
				(guesses as Record<string, string>).A === 'X' &&
				(guesses as Record<string, string>).B === 'Y',
		}),
		win: async (page, stage) => {
			for (const [code, answer] of [
				['A', 'X'],
				['B', 'Y'],
			]) {
				await stage.locator(`[data-cipher-letter="${code}"]`).first().click()
				await page.keyboard.press(answer)
			}
		},
	},
	'word-box': {
		data: frame[0].puzzleData,
		board: 'fieldset > div:has(> div > button)',
		win: async (page, stage) => {
			for (const word of frame[0].solution.words) {
				await stage.getByRole('textbox', { name: 'Current word' }).focus()
				await page.keyboard.type(word)
				await stage.getByRole('button', { name: 'Add word' }).click()
			}
		},
	},
	arithmo: {
		reveal: { equation: '12+34=46' },
		lose: async (page, stage) => {
			for (const [i, guess] of [
				'12+35=47',
				'12+36=48',
				'12+37=49',
				'12+38=50',
				'12+39=51',
				'12+40=52',
			].entries()) {
				await page.keyboard.type(guess)
				await stage.getByRole('button', { name: 'Enter', exact: true }).click()
				await expect(stage.locator('[data-arithmo-grid] [data-grade="absent"]')).toHaveCount(
					(i + 1) * 8,
				)
			}
		},
		data: { length: 8 },
		board: '[data-arithmo-grid]',
		grade: ({ equation }) => ({
			tiles: Array(8).fill(equation === '12+34=46' ? 'correct' : 'absent'),
		}),
		win: async (page, stage) => {
			await page.keyboard.type('12+34=46')
			await stage.getByRole('button', { name: 'Enter', exact: true }).click()
		},
	},
	'block-slide': {
		lose: async (_page, stage) =>
			stage.getByRole('button', { name: 'Give Up', exact: true }).click(),
		data: {
			gridWidth: 4,
			gridHeight: 5,
			exitX: 1,
			exitY: 3,
			minMoves: 2,
			blocks: [
				{ id: 'target', x: 1, y: 1, width: 2, height: 2, isTarget: true },
				{ id: 'a', x: 0, y: 2, width: 1, height: 1, isTarget: false },
			],
		},
		difficulty: 'easy',
		board: '.play-board',
		win: async (page, stage) => {
			await stage.locator('[data-block-id="target"]').click()
			await page.keyboard.press('ArrowDown')
			await page.keyboard.press('ArrowDown')
		},
	},
	'pip-place': {
		data: spots[0].puzzleData,
		board: '.play-board',
		win: async (_page, stage) => {
			for (const { a, b, pa, pb } of spots[0].solution.tiles) {
				await stage.locator(`[data-pip-tile="${Math.min(pa, pb)}-${Math.max(pa, pb)}"]`).click()
				if (pa > pb) await stage.getByRole('button', { name: 'Rotate', exact: true }).click()
				for (const { row, col } of [a, b])
					await stage.locator(`[data-pip-cell="${row},${col}"]`).click()
			}
		},
	},
	'quad-words': {
		reveal: { words: quadAnswers },
		lose: async (page, stage) => {
			for (const [i, word] of [
				'CRANE',
				'RAISE',
				'BLUSH',
				'FLAME',
				'SUGAR',
				'LEMON',
				'TIGER',
				'BRICK',
				'PLANT',
			].entries()) {
				await page.keyboard.type(word)
				await stage.locator('[data-key="Enter"]').click()
				if (i < 8) await expect(stage.locator('.play-meta')).toContainText(`${i + 1}/9`)
			}
		},
		data: {},
		board: '.play-board',
		grade: ({ word }) => ({
			boards: quadAnswers.map((answer) => Array(5).fill(word === answer ? 'correct' : 'absent')),
		}),
		win: async (page, stage) => {
			for (const [i, word] of quadAnswers.entries()) {
				await page.keyboard.type(word)
				await stage.locator('[data-key="Enter"]').click()
				await expect(stage.locator('[data-active-slot="true"]')).toHaveCount(3 - i)
			}
		},
	},
	'word-hive': {
		data: {
			centerLetter: 'E',
			outerLetters: ['C', 'D', 'S', 'T', 'A', 'L'],
			maxScore: 14,
			totalWords: 1,
			totalPangrams: 1,
		},
		board: '.hive-comb',
		grade: ({ word }) => ({
			valid: word === 'CASTLED',
			pangram: word === 'CASTLED',
			totalWords: 1,
			totalPangrams: 1,
		}),
		win: async (page, stage) => {
			await page.keyboard.type('CASTLED')
			await stage.getByRole('button', { name: 'Enter', exact: true }).click()
		},
	},
} satisfies Record<string, FinishFixture>
