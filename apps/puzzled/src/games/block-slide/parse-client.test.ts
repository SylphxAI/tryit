import { describe, expect, test } from 'bun:test'
import cases from '../../../../../crates/puzzled-core/tests/fixtures/generate/block-slide.json'
import { parseBlockSlideClientPayload } from './parse-client'
import { canMove, isWin, moveBlock } from './types'

const served = (cases as Array<{ puzzleData: unknown; solution: unknown }>)[0]

describe('parseBlockSlideClientPayload', () => {
	test('accepts the GetDaily wire form (solution stripped)', () => {
		const parsed = parseBlockSlideClientPayload(served.puzzleData)
		expect(parsed).toEqual(served.puzzleData as never)
	})

	test('accepts the legacy wrapped form and drops the solution', () => {
		const parsed = parseBlockSlideClientPayload({
			puzzleData: served.puzzleData,
			solution: served.solution,
		})
		expect(parsed).toEqual(served.puzzleData as never)
		expect(JSON.stringify(parsed)).not.toContain('solution')
	})

	test('rejects a board without blocks or exit', () => {
		expect(() => parseBlockSlideClientPayload({ blocks: [] })).toThrow()
		expect(() => parseBlockSlideClientPayload(null)).toThrow()
	})
})

describe('the finish is judged by the rules', () => {
	test('the served start is not solved; the target on the exit is', () => {
		const puzzle = parseBlockSlideClientPayload(served.puzzleData)
		expect(isWin(puzzle.blocks, puzzle.exitX, puzzle.exitY)).toBe(false)
		const solved = puzzle.blocks.map((block) =>
			block.isTarget ? { ...block, x: puzzle.exitX, y: puzzle.exitY } : block,
		)
		expect(isWin(solved, puzzle.exitX, puzzle.exitY)).toBe(true)
	})
})

test('a collision is illegal and only the aligned target on the exit wins', () => {
	const puzzle = parseBlockSlideClientPayload({
		gridWidth: 4,
		gridHeight: 5,
		exitX: 1,
		exitY: 3,
		minMoves: 2,
		blocks: [
			{ id: 'target', x: 1, y: 1, width: 2, height: 2, isTarget: true },
			{ id: 'other', x: 0, y: 1, width: 1, height: 1, isTarget: false },
		],
	})
	const { blocks, gridWidth, gridHeight, exitX, exitY } = puzzle
	expect(canMove(blocks, 'target', 'left', gridWidth, gridHeight)).toBe(false)
	expect(canMove(blocks, 'target', 'down', gridWidth, gridHeight)).toBe(true)
	const next = moveBlock(blocks, 'target', 'down')
	expect(isWin(next, exitX, exitY)).toBe(false)
	expect(canMove(next, 'target', 'down', gridWidth, gridHeight)).toBe(true)
	const solved = moveBlock(next, 'target', 'down')
	expect(isWin(solved, exitX, exitY)).toBe(true)
	expect(canMove(solved, 'target', 'down', gridWidth, gridHeight)).toBe(false)
	expect(blocks[0].y).toBe(1)
})
