import { expect, test } from 'bun:test'
import { type Feedback, readWordFeedback, wordKeyFeedback } from './feedback'

test('Five accepts exactly five server-authored feedback values', () => {
	const absent: Feedback[] = ['absent', 'absent', 'absent', 'absent', 'absent']
	expect(readWordFeedback(absent)).toEqual(absent)
	expect(readWordFeedback(absent.slice(1))).toBeUndefined()
	expect(readWordFeedback([...absent, 'correct'])).toBeUndefined()
	expect(readWordFeedback(['correct', 'present', 'absent', 'absent', 'pending'])).toBeUndefined()
	expect(readWordFeedback(Array(5))).toBeUndefined()
})

test('Five never downgrades a key across repeated letters or guesses', () => {
	expect(
		wordKeyFeedback([
			{ word: 'error', tiles: ['absent', 'present', 'correct', 'present', 'absent'] },
			{ word: 'route', tiles: ['absent', 'present', 'absent', 'correct', 'absent'] },
		]),
	).toEqual({ E: 'absent', R: 'correct', O: 'present', U: 'absent', T: 'correct' })
})
