/** @jsxImportSource solid-js */
import { isFieldSet } from '@bufbuild/protobuf'
import { Check, Minus } from 'lucide-solid'
import { createSignal, onCleanup, onMount, Show } from 'solid-js'
import { createGameBehavior } from '@/features/analytics/lib/behavioral-events'
import type { DailySnapshot } from '@/features/daily/lib/daily-fallback'
import { ResultActions } from '@/features/daily/solid/result-actions'
import type { PuzzleDifficulty } from '@/games/types'
import {
	SubmitGuessResponseSchema,
	SubmitPracticeResponseSchema,
} from '@/gen/connect/puzzled/v1/puzzle_pb'
import { isAlreadyPlayedError } from '@/lib/connect/already-played'
import { submitGuess, submitPractice } from '@/lib/connect/puzzle-client'
import { encodeSubmissionJson, type SubmitGuessInput } from '@/lib/connect/puzzle-domain'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { withIdempotencyKey } from '@/lib/idempotency-key'
import { recordFirstFinishDay } from '@/shared/components/pwa-install-policy'
import { practicePuzzleInput } from './grade-board-guess'
import { createPlayDraft, createTransientDraft } from './play-draft'
import { PracticeFinishActions } from './practice-finish-actions'

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

export function BoardFinish(props: {
	finish: ReturnType<typeof createBoardFinish>
	locale: Locale
	message: string
	shareTitle?: string
	shareText?: string
}) {
	const t = createTranslator(props.locale)
	const [resultOpen, setResultOpen] = createSignal(false)
	return (
		<>
			<Show when={props.finish.state() === 'pending'}>
				<p class="completion-card" role="status">
					{t('common.syncing')}
				</p>
			</Show>
			<Show when={props.finish.state() === 'failed'}>
				<p class="completion-card" role="alert">
					{t('common.error')}{' '}
					<button
						type="button"
						class="min-h-11 font-semibold underline"
						onClick={props.finish.retry}
					>
						{t('common.retry')}
					</button>
				</p>
			</Show>
			<Show when={props.finish.result()}>
				{(result) => (
					<div
						class="completion-card"
						data-board-finished
						data-result-open={resultOpen() || undefined}
					>
						<div class="completion-heading" data-outcome={result().status}>
							<span class="completion-mark" aria-hidden="true">
								{result().status === 'won' ? <Check size={17} /> : <Minus size={17} />}
							</span>
							<h2 class="font-display" role="status">
								{result().mode === 'practice'
									? t(result().status === 'won' ? 'practice.won' : 'practice.lost')
									: props.message}
							</h2>
						</div>
						<Show
							when={result().mode === 'practice'}
							fallback={
								<ResultActions
									facts={{ ...result(), mode: result().mode === 'archive' ? 'archive' : 'daily' }}
									isGuest={props.finish.isGuest}
									freshWin
									onDetailsOpenChange={setResultOpen}
									locale={props.locale}
									shareTitle={props.shareTitle}
									shareText={props.shareText}
								/>
							}
						>
							<PracticeFinishActions
								locale={props.locale}
								gameSlug={result().gameSlug}
								attempts={result().attempts}
								score={result().score}
								reveal={
									result().status === 'lost' && props.finish.revealJson()
										? props.message
										: undefined
								}
								onNewPractice={props.finish.onNewPractice}
							/>
						</Show>
					</div>
				)}
			</Show>
		</>
	)
}
