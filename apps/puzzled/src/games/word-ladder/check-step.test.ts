import { expect, test } from 'bun:test'
import ladderGoldens from '../../../../../crates/puzzled-core/tests/fixtures/generate/word-ladder.json'
import { checkLadderStep } from './check-step'

test('gives distinct feedback for dictionary, length, distance and repeats', () => {
	expect(checkLadderStep(['damp'], 'zzzz', 4)).toBe('notInList')
	expect(checkLadderStep(['damp'], 'hot', 4)).toBe('wrongLength')
	expect(checkLadderStep(['damp'], 'tomb', 4)).toBe('notOneChange')
	expect(checkLadderStep(['damp', 'dame'], 'damp', 4)).toBe('alreadyUsed')
	expect(checkLadderStep(['damp'], 'lamp', 4)).toBeNull()
})

test('accepts each generated golden step', () => {
	for (const {
		solution: { path },
		puzzleData: { wordLength },
	} of ladderGoldens) {
		for (let step = 1; step < path.length; step++) {
			expect(checkLadderStep(path.slice(0, step), path[step], wordLength)).toBeNull()
		}
	}
})
