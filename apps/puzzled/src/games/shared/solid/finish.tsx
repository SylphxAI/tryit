/** @jsxImportSource solid-js */
import { createSignal, onCleanup, Show } from 'solid-js'
import type { DailySnapshot } from '@/features/daily/lib/daily-fallback'
import { ritualShareDeepLink } from '@/features/daily/lib/share-text'
import type { PuzzleDifficulty } from '@/games/types'
import { isAlreadyPlayedError } from '@/lib/connect/already-played'
import { shareResult, submitGuess } from '@/lib/connect/puzzle-client'
import type { SubmitGuessInput } from '@/lib/connect/puzzle-domain'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { withIdempotencyKey } from '@/lib/idempotency-key'
import { productDayKey } from '@/lib/product-day'
import { recordFirstFinishDay } from '@/shared/components/pwa-install-policy'

export type DailyBoardProps = {
	puzzle: Extract<DailySnapshot, { kind: 'playable' }>
	locale: Locale
	difficulty?: PuzzleDifficulty
	onAlreadyPlayed: () => void
}

/** Keep the entire intent, including its key and elapsed time, stable across retries. */
export function createBoardFinish(props: DailyBoardProps, gameSlug: string) {
	const mountedAt = Date.now()
	const [state, setState] = createSignal<'playing' | 'pending' | 'failed' | 'accepted'>('playing')
	const [shareId, setShareId] = createSignal<string>()
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
					recordFirstFinishDay(productDayKey())
					setState('accepted')
					void shareResult({ gameSlug, puzzleDate: intent.puzzleDate })
						.then((id) => !disposed && setShareId(id))
						.catch(() => {})
				} else if (isAlreadyPlayedError(result.error)) props.onAlreadyPlayed()
				else setState('failed')
			}
		} catch (error) {
			if (!disposed) {
				if (isAlreadyPlayedError(error)) props.onAlreadyPlayed()
				else setState('failed')
			}
		}
	}
	return {
		state,
		finish(submission: unknown, difficulty = props.difficulty) {
			if (intent) return
			intent = withIdempotencyKey({
				gameSlug,
				status: 'won' as const,
				attempts: 1,
				timeSpentMs: Math.max(0, Date.now() - mountedAt),
				puzzleDate: props.puzzle.puzzleDate,
				puzzleId: props.puzzle.puzzleId,
				difficulty,
				submission,
			})
			void send()
		},
		retry: send,
		async share(title: string) {
			if (state() !== 'accepted') return
			const puzzleDate = intent?.puzzleDate
			const archiveDate = puzzleDate === productDayKey() ? undefined : puzzleDate
			const url = ritualShareDeepLink(window.location.origin, gameSlug, archiveDate, shareId())
			void shareResult({ gameSlug, puzzleDate, tap: true }).catch(() => {})
			// Invoke native share synchronously with the tap; the count must not block it.
			if (navigator.share) await navigator.share({ title, url })
			else await navigator.clipboard.writeText(url)
		},
	}
}

export function BoardFinish(props: {
	finish: ReturnType<typeof createBoardFinish>
	locale: Locale
	message: string
}) {
	const t = createTranslator(props.locale)
	const [sharing, setSharing] = createSignal(false)
	const [notice, setNotice] = createSignal<'error' | 'copied'>()
	async function share() {
		if (sharing()) return
		setSharing(true)
		setNotice(undefined)
		try {
			await props.finish.share(props.message)
			if (!navigator.share) setNotice('copied')
		} catch (error) {
			if (!(error instanceof DOMException && error.name === 'AbortError')) setNotice('error')
		} finally {
			setSharing(false)
		}
	}
	return (
		<>
			<Show when={props.finish.state() === 'pending'}>
				<p role="status">{t('common.syncing')}</p>
			</Show>
			<Show when={props.finish.state() === 'failed'}>
				<p role="alert">
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
			<Show when={props.finish.state() === 'accepted'}>
				<div class="tactile-card space-y-2 p-4">
					<h2 class="font-display text-xl" role="status">
						{props.message}
					</h2>
					<button
						type="button"
						class="min-h-11 font-semibold underline"
						disabled={sharing()}
						onClick={share}
					>
						{t('common.share')}
					</button>
					<Show when={notice() === 'copied'}>
						<p role="status">{t('common.copied')}</p>
					</Show>
					<Show when={notice() === 'error'}>
						<p role="alert">{t('common.error')}</p>
					</Show>
				</div>
			</Show>
		</>
	)
}
