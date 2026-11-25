import { createMemo, createSignal, onCleanup, onMount } from 'solid-js'
import { type ShareAction, trackBehavioralEvent } from '@/features/analytics/lib/behavioral-events'
import { getGameMetadata } from '@/games/registry'
import { shareResult } from '@/lib/connect/puzzle-client'
import { slugToCamelCase } from '@/lib/game-slug'
import type { Locale } from '@/lib/i18n/config'
import type { Translate } from '@/lib/i18n/translate'
import {
	buildResultCard,
	parseResultPattern,
	type ResultCardInput,
	resultCardStringsFrom,
	resultCardTextAlternative,
} from '../lib/result-card'
import { shareResultText } from '../lib/result-share'

export type ResultFacts = Pick<
	ResultCardInput,
	'gameSlug' | 'mode' | 'status' | 'puzzleDate' | 'todayKey' | 'attempts' | 'score' | 'timeSpentMs'
> & { difficulty?: string | null }

export type ShareSurface = 'rail' | 'dialog'

export function createResultShare(
	props: { facts: ResultFacts; locale: Locale; shareTitle?: string; shareText?: string },
	t: Translate,
	hasPercentile: () => boolean,
) {
	const [shareId, setShareId] = createSignal<string>()
	const [pending, setPending] = createSignal(false)
	const [feedback, setFeedback] = createSignal<{
		surface: ShareSurface
		message: string
		caption?: string
	}>()
	let disposed = false
	onCleanup(() => {
		disposed = true
	})
	const [mounted, setMounted] = createSignal(false)
	onMount(async () => {
		setMounted(true)
		if (props.facts.mode !== 'daily') return
		const { gameSlug, puzzleDate } = props.facts
		try {
			const id = await shareResult({ gameSlug, puzzleDate: puzzleDate ?? undefined })
			if (!disposed) setShareId(id)
		} catch {
			/* A result without a share ID still has a playable link. */
		}
	})
	const strings = resultCardStringsFrom((key) => String(t.raw(`share.card.${key}`)))
	const model = createMemo(() => {
		return buildResultCard({
			...props.facts,
			origin: typeof window === 'undefined' ? '' : window.location.origin,
			locale: props.locale,
			gameName: props.shareTitle ?? t(`games.${slugToCamelCase(props.facts.gameSlug)}.name`),
			theme: getGameMetadata(props.facts.gameSlug)?.display.theme ?? 'sky',
			shareId: shareId(),
			pattern: parseResultPattern(props.shareText),
		})
	})
	const nativeShareAvailable = () => mounted() && typeof navigator.share === 'function'
	function beginShare() {
		if (pending()) return false
		setPending(true)
		setFeedback(undefined)
		return true
	}
	function recordShareTap(card: ReturnType<typeof model>, action: ShareAction) {
		const includesPercentile = hasPercentile()
		if (action !== 'save_png' && card.mode === 'daily' && card.dayKey) {
			// The wrapper emits share_clicked and keeps the server share-tap counter.
			return shareResult({
				gameSlug: card.gameSlug,
				puzzleDate: card.dayKey,
				tap: true,
				action,
				hasPercentile: includesPercentile,
			}).catch(() => undefined)
		}
		trackBehavioralEvent({
			event: 'share_clicked',
			game_slug: card.gameSlug,
			action,
			has_percentile: includesPercentile,
		})
	}
	async function shareChallenge(surface: ShareSurface, action: 'copy_challenge' | 'native_share') {
		if (!beginShare()) return
		try {
			let card = model()
			const tap = recordShareTap(card, action)
			if (tap && action === 'copy_challenge') {
				// Keep the first tap usable even if the prefetch hasn't returned yet.
				// With an ID already available, don't wait before using the clipboard.
				if (!shareId()) {
					const id = await tap
					if (disposed) return
					if (id) setShareId(id)
					card = model()
				}
			}
			const caption = [props.shareText, resultCardTextAlternative(card, strings)]
				.filter(Boolean)
				.join('\n\n')
			// Native share needs the original click's user activation. Use the
			// prefetched ID if ready, or the playable link already on the card.
			const outcome = await shareResultText(caption, {
				preferClipboard: action === 'copy_challenge',
			})
			if (outcome === 'copied') setFeedback({ surface, message: 'gameResult.challengeCopied' })
			if (outcome === 'unavailable') {
				setFeedback({ surface, message: 'share.card.unavailable', caption })
			}
		} finally {
			setPending(false)
		}
	}
	async function save() {
		if (!beginShare()) return
		try {
			const card = model()
			recordShareTap(card, 'save_png')
			const { saveRitualResultCard } = await import('../lib/share-result-card')
			const saved = await saveRitualResultCard(card, strings)
			setFeedback({
				surface: 'dialog',
				message: saved ? 'share.card.saved' : 'gameResult.saveFailed',
			})
		} catch {
			setFeedback({ surface: 'dialog', message: 'gameResult.saveFailed' })
		} finally {
			setPending(false)
		}
	}
	return { model, strings, mounted, nativeShareAvailable, pending, feedback, shareChallenge, save }
}
