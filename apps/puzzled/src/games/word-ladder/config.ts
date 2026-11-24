/**
 * Word Ladder Game Configuration
 * Transform one word into another, one letter at a time
 */

import { compareByTime, isPerfectGame } from '@/games/shared'
import { formatTimer } from '@/games/shared/format'
import { DEFAULT_LAUNCH_DATE, type GameConfig } from '../types'
import type {
	WordLadderGuess,
	WordLadderGuessResult,
	WordLadderPuzzleData,
	WordLadderSolution,
} from './types'

// Client-side puzzle data
type WordLadderPuzzleClientData = WordLadderPuzzleData

export const wordLadderConfig: GameConfig<
	WordLadderPuzzleClientData,
	WordLadderSolution,
	WordLadderGuess,
	WordLadderGuessResult
> = {
	slug: 'word-ladder',
	name: 'Rungs',
	description: 'Transform one word into another, changing one letter at a time',

	sortOrder: 7,
	category: 'word',
	skills: ['vocabulary'],
	difficulty: 'medium',
	display: {
		taglineKey: 'games.wordLadder.tagline',
		highlightKey: 'games.wordLadder.highlight',
		durationMinutes: 3,
		theme: 'orange',
	},
	generationStrategy: 'seed',

	launchDate: DEFAULT_LAUNCH_DATE,
	isPerfectGame,
	compareForPercentile: compareByTime,

	// Custom: shows attempts/maxAttempts if available
	formatScoreDisplay: (stats) => {
		if (stats.status === 'lost') return 'Lost'
		if (stats.attempts && stats.maxAttempts) {
			return `${stats.attempts}/${stats.maxAttempts}`
		}
		if (stats.timeSpentMs) {
			return formatTimer(stats.timeSpentMs)
		}
		return stats.score ? `${stats.score} pts` : 'Won'
	},
}
