/** @jsxImportSource solid-js */
import { isFieldSet } from '@bufbuild/protobuf'
import { Check, Minus } from 'lucide-solid'
import { createSignal, onCleanup, Show } from 'solid-js'
import type { DailySnapshot } from '@/features/daily/lib/daily-fallback'
import { ResultActions } from '@/features/daily/solid/result-actions'
import type { PuzzleDifficulty } from '@/games/types'
import { SubmitGuessResponseSchema } from '@/gen/connect/puzzled/v1/puzzle_pb'
import { isAlreadyPlayedError } from '@/lib/connect/already-played'
import { submitGuess } from '@/lib/connect/puzzle-client'
import type { SubmitGuessInput } from '@/lib/connect/puzzle-domain'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { withIdempotencyKey } from '@/lib/idempotency-key'
import { recordFirstFinishDay } from '@/shared/components/pwa-install-policy'
import { createPlayDraft } from './play-draft'

export type DailyBoardProps = {
	puzzle: Extract<DailySnapshot, { kind: 'playable' }>
	locale: Locale
	mode?: 'daily' | 'archive'
	difficulty?: PuzzleDifficulty
	onAlreadyPlayed: () => void
}

/** Keep the entire intent, including its key and elapsed time, stable across retries. */
export function createBoardFinish(
	props: DailyBoardProps,
	gameSlug: string,
	options?: { onRejected: (error: string) => void },
) {
	const [state, setState] = createSignal<'playing' | 'pending' | 'failed' | 'accepted'>('playing')
	const draft = createPlayDraft(
		props.mode !== 'archive' && props.puzzle.puzzleId
			? {
					day: props.puzzle.puzzleDate,
					game: gameSlug,
					difficulty: props.difficulty,
					puzzleId: props.puzzle.puzzleId,
				}
			: undefined,
		() => state() === 'playing',
	)
	const [score, setScore] = createSignal<number>()
	const [revealJson, setRevealJson] = createSignal<string>()
	let intent: SubmitGuessInput | undefined
	let disposed = false
	onCleanup(() => {
		disposed = true
	})
	async function send() {
		if (!intent || (state() !== 'playing' && state() !== 'failed')) return
		setState('pending')
		try {
			const result = await submitGuess(intent)
			if (!disposed) {
				if (result.valid && result.status === intent.status) {
					draft.discard()
					if (props.mode !== 'archive')
						recordFirstFinishDay(intent.puzzleDate ?? props.puzzle.puzzleDate)
					setRevealJson(result.revealJson)
					if (isFieldSet(result, SubmitGuessResponseSchema.field.score)) setScore(result.score)
					setState('accepted')
				} else if (isAlreadyPlayedError(result.error)) alreadyPlayed()
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
				if (isAlreadyPlayedError(error)) alreadyPlayed()
				else setState('failed')
			}
		}
	}
	function alreadyPlayed() {
		draft.discard()
		props.onAlreadyPlayed()
	}
	return {
		state,
		draft,
		result() {
			if (state() !== 'accepted' || !intent) return
			return {
				gameSlug,
				mode: props.mode ?? 'daily',
				status: intent.status,
				puzzleDate: intent.puzzleDate,
				difficulty: intent.difficulty,
				attempts: intent.attempts,
				score: score(),
				timeSpentMs: intent.timeSpentMs,
			} as const
		},
		revealJson,
		finish(
			submission: unknown,
			options?: Partial<Pick<SubmitGuessInput, 'difficulty' | 'status' | 'attempts'>>,
		) {
			if (intent) return
			intent = withIdempotencyKey({
				gameSlug,
				status: options?.status ?? 'won',
				attempts: options?.attempts ?? 1,
				timeSpentMs: draft.elapsedMs(),
				puzzleDate: props.puzzle.puzzleDate,
				puzzleId: props.puzzle.puzzleId,
				difficulty: options?.difficulty ?? props.difficulty,
				submission,
			})
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
								{props.message}
							</h2>
						</div>
						<ResultActions
							facts={result()}
							onDetailsOpenChange={setResultOpen}
							locale={props.locale}
							shareTitle={props.shareTitle}
							shareText={props.shareText}
						/>
					</div>
				)}
			</Show>
		</>
	)
}
