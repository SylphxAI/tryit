/** @jsxImportSource solid-js */
import { ChartNoAxesColumnIncreasing, Download, Share2 } from 'lucide-solid'
import { createMemo, createSignal, onCleanup, onMount, Show } from 'solid-js'
import { getGameMetadata } from '@/games/registry'
import { shareResult } from '@/lib/connect/puzzle-client'
import { slugToCamelCase } from '@/lib/game-slug'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import {
	buildResultCard,
	type ResultCardInput,
	type ResultCardTile,
	resultCardStringsFrom,
	resultCardTextAlternative,
} from '../lib/result-card'
import { shareResultText } from '../lib/result-share'
import { ResultDetails } from './result-details'
import './result.css'

type Facts = Pick<
	ResultCardInput,
	'gameSlug' | 'mode' | 'status' | 'puzzleDate' | 'todayKey' | 'attempts' | 'score' | 'timeSpentMs'
> & { difficulty?: string | null }
const tile: Record<string, ResultCardTile> = {
	'🟩': 'hit',
	'🟨': 'near',
	'⬛': 'miss',
	'⬜': 'miss',
}

type Surface = 'rail' | 'dialog'

export function ResultActions(props: {
	facts: Facts
	locale: Locale
	onDetailsOpenChange: (open: boolean) => void
	shareTitle?: string
	shareText?: string
}) {
	const [shareId, setShareId] = createSignal<string>()
	const [pending, setPending] = createSignal(false)
	const [feedback, setFeedback] = createSignal<{
		surface: Surface
		message: string
		caption?: string
	}>()
	let disposed = false
	onCleanup(() => {
		disposed = true
	})
	onMount(async () => {
		if (props.facts.mode !== 'daily') return
		const { gameSlug, puzzleDate } = props.facts
		try {
			const id = await shareResult({ gameSlug, puzzleDate: puzzleDate ?? undefined })
			if (!disposed) setShareId(id)
		} catch {
			/* A result without a share ID still has a playable link. */
		}
	})
	const t = createTranslator(props.locale)
	const strings = resultCardStringsFrom((key) => String(t.raw(`share.card.${key}`)))
	const model = createMemo(() => {
		const rows = props.shareText
			?.trim()
			.split('\n')
			.map((row) => Array.from(row.trim()))
		return buildResultCard({
			...props.facts,
			origin: typeof window === 'undefined' ? '' : window.location.origin,
			locale: props.locale,
			gameName: props.shareTitle ?? t(`games.${slugToCamelCase(props.facts.gameSlug)}.name`),
			theme: getGameMetadata(props.facts.gameSlug)?.display.theme ?? 'sky',
			shareId: shareId(),
			pattern: rows?.every((row) => row.length && row.every((cell) => tile[cell]))
				? rows.map((row) => row.map((cell) => tile[cell]))
				: undefined,
		})
	})
	async function share(surface: Surface) {
		if (pending()) return
		setPending(true)
		setFeedback(undefined)
		const card = model()
		const caption = [props.shareText, resultCardTextAlternative(card, strings)]
			.filter(Boolean)
			.join('\n\n')
		if (card.mode === 'daily' && card.dayKey) {
			void shareResult({ gameSlug: card.gameSlug, puzzleDate: card.dayKey, tap: true }).catch(
				() => {},
			)
		}
		try {
			const result =
				surface === 'dialog'
					? await (await import('../lib/share-result-card')).shareRitualResultCard({
							model: card,
							strings,
							text: caption,
							title: card.gameName,
						})
					: { outcome: await shareResultText(caption), captionCopied: false }
			const { outcome } = result
			if (outcome === 'downloaded')
				setFeedback({
					surface,
					message: result.captionCopied ? 'gameResult.savedAndCopied' : 'share.card.saved',
					caption: result.captionCopied ? undefined : caption,
				})
			if (outcome === 'copied') setFeedback({ surface, message: 'common.copied' })
			if (outcome === 'unavailable') {
				setFeedback({ surface, message: 'share.card.unavailable', caption })
			}
		} finally {
			setPending(false)
		}
	}
	async function save() {
		if (pending()) return
		setPending(true)
		setFeedback(undefined)
		try {
			const { saveRitualResultCard } = await import('../lib/share-result-card')
			const saved = await saveRitualResultCard(model(), strings)
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
	const status = (surface: Surface) => (
		<Show when={feedback()?.surface === surface && feedback()}>
			{(state) => (
				<div class="result-feedback">
					<p role="status">{t(state().message)}</p>
					<Show when={state().caption}>
						{(caption) => (
							<label>
								{t('share.card.caption')}
								<textarea
									rows={3}
									readOnly
									value={caption()}
									class="mt-1 w-full rounded-lg border border-border p-2"
									onFocus={(event) => event.currentTarget.select()}
								/>
							</label>
						)}
					</Show>
				</div>
			)}
		</Show>
	)
	return (
		<>
			<div class="result-action-row">
				<button
					type="button"
					class="result-button"
					aria-disabled={pending() || undefined}
					onClick={() => void share('rail')}
				>
					<Share2 size={16} aria-hidden="true" />
					{t('common.share')}
				</button>
				<ResultDetails
					locale={props.locale}
					onOpenChange={props.onDetailsOpenChange}
					model={model()}
					strings={strings}
					timeSpentMs={props.facts.timeSpentMs}
					difficulty={props.facts.difficulty}
					trigger={
						<>
							<ChartNoAxesColumnIncreasing size={16} aria-hidden="true" />
							{t('gameResult.seeResult')}
						</>
					}
				>
					<div class="result-action-row">
						<button
							type="button"
							class="result-button"
							aria-disabled={pending() || undefined}
							onClick={() => void share('dialog')}
						>
							<Share2 size={16} aria-hidden="true" />
							{t('gameResult.shareResult')}
						</button>
						<button
							type="button"
							class="result-button"
							aria-disabled={pending() || undefined}
							onClick={() => void save()}
						>
							<Download size={16} aria-hidden="true" />
							{t('gameResult.savePng')}
						</button>
					</div>
					{status('dialog')}
				</ResultDetails>
			</div>
			{status('rail')}
		</>
	)
}
