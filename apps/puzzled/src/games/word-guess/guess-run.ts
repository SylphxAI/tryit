import { Code, ConnectError } from '@connectrpc/connect'
import { type Feedback, readWordFeedback } from './feedback'

export type FiveRow = { word: string; tiles: Feedback[] }
type FivePuzzle = { puzzleDate: string; puzzleId: string }
type PendingGuess = { word: string; settled: Promise<void> }
export type FiveRun = {
	rows: FiveRow[]
	pending?: PendingGuess
	failedWord?: string
	notInWordList?: boolean
}

// Only the browser document that sent CheckGuess can observe its reply. Do not
// store this in Web Storage or replay it: CheckGuess spends a server guess and
// exposes neither an idempotency key nor a read of partially completed rows.
const runs = new Map<string, FiveRun>()

function runKey(scope: string, { puzzleDate, puzzleId }: FivePuzzle) {
	return JSON.stringify([scope, puzzleDate, puzzleId])
}

export function hasFiveRuns() {
	return runs.size > 0
}

export function getFiveRun(scope: string | undefined, puzzle: FivePuzzle) {
	return scope ? runs.get(runKey(scope, puzzle)) : undefined
}

export function forgetFiveRun(scope: string | undefined, puzzle: FivePuzzle) {
	if (scope) runs.delete(runKey(scope, puzzle))
}

export function openFiveRun(
	scope: string | undefined,
	puzzle: FivePuzzle,
	rows: FiveRow[] = [],
): FiveRun {
	const previous = getFiveRun(scope, puzzle)
	if (previous) return previous
	const run: FiveRun = { rows }
	if (scope) runs.set(runKey(scope, puzzle), run)
	return run
}

export function sendFiveGuess(
	run: FiveRun,
	word: string,
	grade: () => Promise<unknown>,
): PendingGuess {
	if (run.pending) return run.pending
	const pending: PendingGuess = {
		word,
		// Publish the pending intent before sending; a new board only joins this promise.
		settled: Promise.resolve().then(async () => {
			try {
				const response = (await grade()) as { tiles?: unknown } | null
				const tiles = readWordFeedback(response?.tiles)
				if (!tiles) throw new Error('invalid_word_grade')
				run.rows = [...run.rows, { word, tiles }]
			} catch (error) {
				run.failedWord = word
				run.notInWordList =
					error instanceof ConnectError &&
					error.code === Code.InvalidArgument &&
					error.rawMessage === 'Not in word list'
			} finally {
				run.pending = undefined
			}
		}),
	}
	run.failedWord = undefined
	run.notInWordList = undefined
	run.pending = pending
	return pending
}
