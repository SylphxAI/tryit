/**
 * Path game configuration
 * Visit 1…n, every cell once, consecutive cells orthogonally adjacent.
 */

import { compareByTime, formatTimeScore, isPerfectGame } from '@/games/shared'
import { DEFAULT_LAUNCH_DATE, type GameConfig } from '../types'
import type {
	NumberPathGuess,
	NumberPathGuessResult,
	NumberPathPuzzleData,
	NumberPathSolution,
} from './types'

export const numberPathConfig: GameConfig<
	NumberPathPuzzleData,
	NumberPathSolution,
	NumberPathGuess,
	NumberPathGuessResult
> = {
	slug: 'number-path',
	name: 'Path',
	description: 'Visit 1…n without crossing',

	sortOrder: 20,
	category: 'spatial',
	skills: ['spatial', 'logic'],
	difficulty: 'medium',
	display: {
		taglineKey: 'games.numberPath.tagline',
		highlightKey: 'games.numberPath.highlight',
		durationMinutes: 5,
		theme: 'slate',
	},
	generationStrategy: 'seed',

	launchDate: DEFAULT_LAUNCH_DATE,
	isPerfectGame,
	formatScoreDisplay: formatTimeScore,
	compareForPercentile: compareByTime,
}
