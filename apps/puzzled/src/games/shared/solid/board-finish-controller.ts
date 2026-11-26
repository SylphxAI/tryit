import { isFieldSet } from '@bufbuild/protobuf'
import { createSignal, onCleanup, onMount } from 'solid-js'
import { createGameBehavior } from '@/features/analytics/lib/behavioral-events'
import type { DailySnapshot } from '@/features/daily/lib/daily-fallback'
import type { PuzzleDifficulty } from '@/games/types'
import {
	SubmitGuessResponseSchema,
	SubmitPracticeResponseSchema,
} from '@/gen/connect/puzzled/v1/puzzle_pb'
import { isAlreadyPlayedError } from '@/lib/connect/already-played'
import { submitGuess, submitPractice } from '@/lib/connect/puzzle-client'
import { encodeSubmissionJson, type SubmitGuessInput } from '@/lib/connect/puzzle-domain'
import type { Locale } from '@/lib/i18n/config'
import { withIdempotencyKey } from '@/lib/idempotency-key'
import { recordFirstFinishDay } from '@/shared/components/pwa-install-policy'
import { practicePuzzleInput } from './grade-board-guess'
import { createPlayDraft, createTransientDraft } from './play-draft'

export type DailyBoardProps = {
	puzzle: Extract<DailySnapshot, { kind: 'playable' }>
	locale: Locale
	todayKey?: string
	mode?: 'daily' | 'archive' | 'practice'
	practiceSeed?: bigint
	onNewPractice?: () => void
	difficulty?: PuzzleDifficulty
	draftScope?: string
	isGuest?: boolean
	guestStatusPending?: boolean
	retryGuestStatus?: () => void
	pickIndex?: number | null
	onAlreadyPlayed: () => void
}

/** Keep the entire intent, including its key and elapsed time, stable across retries. */
export function createBoardFinish(
	props: DailyBoardProps,
	gameSlug: string,
	options?: { onRejected: (error: string) => void },
) {
	const [state, setState] = createSignal<'playing' | 'pending' | 'failed' | 'accepted'>('playing')
	const mode = props.mode ?? 'daily'
	const practice = mode === 'practice'
	const behavior = createGameBehavior(gameSlug, mode, () => props.isGuest)
	const abandon = () => behavior.abandon()
	let boardMounted = false
	onMount(() => {
		window.addEventListener('pagehide', abandon)
		// Child onMount callbacks can initialize board state (e.g. select a cell).
		queueMicrotask(() => {
			boardMounted = true
		})
	})
	const onProgress = () => {
		if (boardMounted && state() === 'playing') behavior.interact()
	}
	const draft = practice
		? createTransientDraft(onProgress)
		: createPlayDraft(
				mode === 'daily' && props.puzzle.puzzleId && props.draftScope
					? {
							day: props.puzzle.puzzleDate,
							game: gameSlug,
							difficulty: props.difficulty,
							puzzleId: props.puzzle.puzzleId,
							owner: props.draftScope,
						}
					: undefined,
				() => state() === 'playing',
				onProgress,
			)
	const [score, setScore] = createSignal<number>()
	const [revealJson, setRevealJson] = createSignal<string>()
	let intent: SubmitGuessInput | undefined
	let disposed = false
	onCleanup(() => {
		disposed = true
		if (typeof window !== 'undefined') window.removeEventListener('pagehide', abandon)
		abandon()
	})
	async function send() {
		if (!intent || (state() !== 'playing' && state() !== 'failed')) return
		setState('pending')
		try {
			const { status, attempts, timeSpentMs } = intent
			const result = practice
				? await submitPractice({
						...practicePuzzleInput(props, gameSlug),
						status,
						attempts,
						timeSpentMs,
						submissionJson: encodeSubmissionJson(intent),
					})
				: await submitGuess(intent)
			if (!disposed) {
				if (
					result.valid &&
					result.status === status &&
					(!practice || result.gameSlug === gameSlug)
				) {
					behavior.complete(status, timeSpentMs, practice ? null : (props.pickIndex ?? null))
					if (!practice) draft.discard()
					if (mode === 'daily') recordFirstFinishDay(props.puzzle.puzzleDate)
					setRevealJson(!practice || status === 'lost' ? result.revealJson : undefined)
					const scoreField = practice
						? SubmitPracticeResponseSchema.field.score
						: SubmitGuessResponseSchema.field.score
					if (isFieldSet(result, scoreField)) setScore(result.score)
					setState('accepted')
				} else if (!practice && isAlreadyPlayedError(result.error)) alreadyPlayed()
				else if (
					options &&
					!result.valid &&
					!result.status &&
					result.gameSlug === gameSlug &&
					result.error
				) {
					// The authority rejected the submission without saving it. Editable games may
					// issue a new intent after correction; ambiguous outcomes keep their old key.
					intent = undefined
					options.onRejected(result.error)
					setState('playing')
				} else setState('failed')
			}
		} catch (error) {
			if (!disposed) {
				if (!practice && isAlreadyPlayedError(error)) alreadyPlayed()
				else setState('failed')
			}
		}
	}
	function alreadyPlayed() {
		behavior.alreadyPlayed()
		draft.discard()
		props.onAlreadyPlayed()
	}
	return {
		state,
		draft,
		get isGuest() {
			return props.isGuest
		},
		get guestStatusPending() {
			return props.guestStatusPending
		},
		get retryGuestStatus() {
			return props.retryGuestStatus
		},
		onNewPractice: props.onNewPractice,
		result() {
			if (state() !== 'accepted' || !intent) return
			return {
				gameSlug,
				mode,
				status: intent.status,
				puzzleDate: intent.puzzleDate,
				todayKey: props.todayKey,
				difficulty: intent.difficulty,
				attempts: intent.attempts,
				score: score(),
				timeSpentMs: intent.timeSpentMs,
			} as const
		},
		revealJson,
		recordProgress: behavior.interact,
		finish(
			submission: unknown,
			options?: Partial<Pick<SubmitGuessInput, 'difficulty' | 'status' | 'attempts'>>,
		) {
			if (intent) return
			behavior.interact()
			const next: SubmitGuessInput = {
				gameSlug,
				status: options?.status ?? 'won',
				attempts: options?.attempts ?? 1,
				timeSpentMs: draft.elapsedMs(),
				puzzleDate: props.puzzle.puzzleDate,
				puzzleId: props.puzzle.puzzleId,
				difficulty: options?.difficulty ?? props.difficulty,
				submission,
			}
			intent = practice ? next : withIdempotencyKey(next)
			void send()
		},
		retry: send,
	}
}
