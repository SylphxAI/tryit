import { afterEach, expect, mock, test } from 'bun:test'
import { Code } from '@connectrpc/connect'
import { createRoot } from 'solid-js'
import { parseGrade } from '@/games/arithmo/feedback'
import { getPracticePuzzle } from '@/lib/connect/puzzle-client'
import { resetConnectTransportCache } from '@/lib/connect/transport'
import type { DailyBoardProps } from './board-finish-controller'
import { gradeBoardGuess } from './grade-board-guess'

const recordFirstFinishDay = mock(() => {})
const complete = mock(() => {})
const createGameBehavior = mock(() => ({ interact() {}, abandon() {}, complete }))
const makeDailyDraft = mock(() => {
	throw new Error('practice must not open a daily draft')
})
mock.module('@/features/analytics/lib/behavioral-events', () => ({ createGameBehavior }))
mock.module('@/shared/components/pwa-install-policy', () => ({ recordFirstFinishDay }))
const realDraft = await import('./play-draft')
mock.module('./play-draft', () => ({ ...realDraft, createPlayDraft: makeDailyDraft }))
const { createBoardFinish } = await import('./board-finish-controller')

const originalFetch = globalThis.fetch
const seed = 9_007_199_254_740_993n
const puzzle = {
	kind: 'playable',
	puzzleId: 'should-not-leak',
	puzzleDate: '2026-11-25',
	puzzleData: {},
} as const
const practiceProps: DailyBoardProps = {
	locale: 'en-US',
	mode: 'practice',
	practiceSeed: seed,
	difficulty: 'hard',
	puzzle,
	draftScope: 'should-not-touch',
	pickIndex: 3,
	isGuest: false,
	onAlreadyPlayed() {
		throw new Error('must not enter daily completion')
	},
}

afterEach(() => {
	resetConnectTransportCache()
	globalThis.fetch = originalFetch
})

test('practice finish sends the exact seed and never touches the daily draft, picks or finish day', async () => {
	let requests = 0
	globalThis.fetch = (async (input, init) => {
		const req = new Request(input, init)
		requests++
		expect(req.url).toEndWith('/puzzled.v1.PuzzleService/SubmitPractice')
		const body = await req.json()
		expect(body).toEqual({
			gameSlug: 'word-guess',
			practiceSeed: String(seed),
			difficulty: 'hard',
			status: 'lost',
			attempts: 6,
			...(body.timeSpentMs !== undefined ? { timeSpentMs: expect.stringMatching(/^\d+$/) } : {}),
			submissionJson: '{"guesses":["crane"]}',
		})
		return Response.json({
			valid: true,
			status: 'lost',
			gameSlug: 'word-guess',
			score: 0,
			revealJson: '{"word":"tiger"}',
		})
	}) as typeof fetch
	const { finish, dispose } = createRoot((dispose) => ({
		finish: createBoardFinish(practiceProps, 'word-guess'),
		dispose,
	}))
	try {
		const [rows, setRows] = finish.draft.signal('rows', ['crane'])
		setRows(['crane', 'slate'])
		expect(rows()).toEqual(['crane', 'slate'])
		finish.finish({ guesses: ['crane'] }, { status: 'lost', attempts: 6 })
		await Bun.sleep(0)
		expect(requests).toBe(1)
		expect(finish.result()).toMatchObject({
			mode: 'practice',
			status: 'lost',
			score: 0,
			attempts: 6,
		})
		expect(finish.revealJson()).toBe('{"word":"tiger"}')
		expect(makeDailyDraft).not.toHaveBeenCalled()
		expect(recordFirstFinishDay).not.toHaveBeenCalled()
		expect(createGameBehavior).toHaveBeenCalledWith('word-guess', 'practice', expect.any(Function))
		expect(complete).toHaveBeenCalledWith('lost', expect.any(Number), null)
	} finally {
		dispose()
	}
})

test.each(['word-guess', 'quad-words'])(
	'%s practice guesses never fall through to daily CheckGuess',
	async (gameSlug) => {
		const seen: string[] = []
		globalThis.fetch = (async (input, init) => {
			const req = new Request(input, init)
			seen.push(req.url)
			expect(await req.json()).toEqual({
				gameSlug,
				difficulty: 'hard',
				practiceSeed: String(seed),
				guessJson: '{"word":"crane"}',
			})
			return Response.json(
				{ code: 'permission_denied', message: 'plus_required_for_practice' },
				{ status: 403 },
			)
		}) as typeof fetch
		await expect(gradeBoardGuess(practiceProps, gameSlug, { word: 'crane' })).rejects.toMatchObject(
			{ code: Code.PermissionDenied, rawMessage: 'plus_required_for_practice' },
		)
		expect(() =>
			gradeBoardGuess({ ...practiceProps, practiceSeed: 0n }, gameSlug, { word: 'crane' }),
		).toThrow('missing_practice_seed')
		expect(seen).toHaveLength(1)
		expect(seen[0]).toEndWith('/puzzled.v1.PuzzleService/CheckPracticeGuess')
	},
)

test('Arithmo receives eight graded tiles from CheckPracticeGuess', async () => {
	const tiles: NonNullable<ReturnType<typeof parseGrade>> = [
		'correct',
		'present',
		'absent',
		'absent',
		'present',
		'absent',
		'correct',
		'absent',
	]
	const guess = { equation: '12+34=46' }
	const props = { ...practiceProps, difficulty: undefined }
	const send = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
		const req = new Request(input, init)
		expect(req.url).toEndWith('/puzzled.v1.PuzzleService/CheckPracticeGuess')
		expect(await req.json()).toEqual({
			gameSlug: 'arithmo',
			practiceSeed: String(seed),
			guessJson: JSON.stringify(guess),
		})
		return Response.json({ resultJson: JSON.stringify({ tiles }) })
	})
	globalThis.fetch = send as unknown as typeof fetch
	expect(parseGrade(await gradeBoardGuess(props, 'arithmo', guess))).toEqual(tiles)
	expect(() => gradeBoardGuess({ ...props, practiceSeed: 0n }, 'arithmo', guess)).toThrow(
		'missing_practice_seed',
	)
	expect(send).toHaveBeenCalledTimes(1)
})

test.each([
	['killer-sudoku', 'easy', { finalGrid: [[1]], mistakes: 0 }],
	['block-slide', 'hard', { moveCount: 42 }],
] as const)(
	'%s carries the picked level through practice fetch and finish',
	async (gameSlug, difficulty, submission) => {
		const paths: string[] = []
		globalThis.fetch = (async (input, init) => {
			const req = new Request(input, init)
			const method = new URL(req.url).pathname.split('/').at(-1)
			const body = await req.json()
			expect(body).toMatchObject({ gameSlug, difficulty })
			if (method === 'GetPracticePuzzle') {
				paths.push(method)
				expect(body).toEqual({ gameSlug, difficulty })
				return Response.json({
					gameSlug,
					difficulty,
					practiceSeed: String(seed),
					puzzleDataJson: '{}',
				})
			}
			expect(method).toBe('SubmitPractice')
			paths.push('SubmitPractice')
			expect(body).toMatchObject({
				practiceSeed: String(seed),
				status: 'won',
				submissionJson: JSON.stringify(submission),
			})
			expect(body).not.toHaveProperty('puzzleId')
			expect(body).not.toHaveProperty('puzzleDate')
			return Response.json({ valid: true, gameSlug, status: 'won' })
		}) as typeof fetch
		const board = await getPracticePuzzle({ gameSlug, difficulty, practiceSeed: 0n })
		const { finish, dispose } = createRoot((dispose) => ({
			finish: createBoardFinish(
				{ ...practiceProps, practiceSeed: board.practiceSeed, difficulty },
				gameSlug,
			),
			dispose,
		}))
		try {
			finish.finish(submission)
			await Bun.sleep(0)
			expect(finish.result()).toMatchObject({
				mode: 'practice',
				gameSlug,
				difficulty,
				status: 'won',
			})
			expect(paths).toEqual(['GetPracticePuzzle', 'SubmitPractice'])
			expect(makeDailyDraft).not.toHaveBeenCalled()
			expect(recordFirstFinishDay).not.toHaveBeenCalled()
		} finally {
			dispose()
		}
	},
)

test('practice fetch preserves Unauthenticated without bootstrapping a daily guest', async () => {
	const seen: string[] = []
	globalThis.fetch = (async (input, init) => {
		const req = new Request(input, init)
		seen.push(req.url)
		expect(await req.json()).toEqual({ gameSlug: 'sudoku', difficulty: 'medium' }) // ProtoJSON omits default 0n.
		return Response.json(
			{ code: 'unauthenticated', message: 'identity_required_for_practice' },
			{ status: 401 },
		)
	}) as typeof fetch
	await expect(
		getPracticePuzzle({ gameSlug: 'sudoku', practiceSeed: 0n, difficulty: 'medium' }),
	).rejects.toMatchObject({ code: Code.Unauthenticated })
	expect(seen).toHaveLength(1)
	expect(seen[0]).toEndWith('/puzzled.v1.PuzzleService/GetPracticePuzzle')
})
