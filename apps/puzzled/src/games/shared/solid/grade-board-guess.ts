import {
	checkGuess,
	checkPracticeGuess,
	type PracticePuzzleInput,
} from '@/lib/connect/puzzle-client'
import type { DailyBoardProps } from './finish'

export function practicePuzzleInput(
	props: Pick<DailyBoardProps, 'practiceSeed' | 'difficulty'>,
	gameSlug: string,
): PracticePuzzleInput {
	if (props.practiceSeed === undefined || props.practiceSeed <= 0n) {
		throw new Error('missing_practice_seed')
	}
	return { gameSlug, practiceSeed: props.practiceSeed, difficulty: props.difficulty }
}

export function gradeBoardGuess(
	props: Pick<DailyBoardProps, 'mode' | 'practiceSeed' | 'difficulty' | 'puzzle'>,
	gameSlug: string,
	guess: unknown,
) {
	if (props.mode === 'practice')
		return checkPracticeGuess({ ...practicePuzzleInput(props, gameSlug), guess })
	return checkGuess({
		gameSlug,
		puzzleId: props.puzzle.puzzleId,
		puzzleDate: props.puzzle.puzzleDate,
		difficulty: props.difficulty,
		guess,
	})
}
