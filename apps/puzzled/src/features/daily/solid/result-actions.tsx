/** @jsxImportSource solid-js */
import { createSignal, onCleanup, onMount, Show } from 'solid-js'
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

type Facts = Pick<
	ResultCardInput,
	'gameSlug' | 'mode' | 'status' | 'puzzleDate' | 'attempts' | 'score' | 'timeSpentMs'
>
const tile: Record<string, ResultCardTile> = {
	'🟩': 'hit',
	'🟨': 'near',
	'⬛': 'miss',
	'⬜': 'miss',
}

export function ResultActions(props: {
	facts: Facts
	locale: Locale
	shareTitle?: string
	shareText?: string
}) {
	const [shareId, setShareId] = createSignal<string>()
	const [pending, setPending] = createSignal(false)
	const [notice, setNotice] = createSignal<string>()
	const [recovery, setRecovery] = createSignal<string>()
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
	const model = () => {
		const rows = props.shareText
			?.trim()
			.split('\n')
			.map((row) => Array.from(row.trim()))
		return buildResultCard({
			...props.facts,
			origin: typeof window === 'undefined' ? '' : window.location.origin,
			locale: props.locale,
			gameName: t(`games.${slugToCamelCase(props.facts.gameSlug)}.name`),
			theme: getGameMetadata(props.facts.gameSlug)?.display.theme ?? 'sky',
			shareId: shareId(),
			pattern: rows?.every((row) => row.length && row.every((cell) => tile[cell]))
				? rows.map((row) => row.map((cell) => tile[cell]))
				: undefined,
		})
	}
	async function share(asImage: boolean) {
		if (pending()) return
		setPending(true)
		setNotice(undefined)
		setRecovery(undefined)
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
			if (asImage) {
				const { shareRitualResultCard } = await import('../lib/share-result-card')
				const { outcome, captionCopied } = await shareRitualResultCard({
					model: card,
					strings,
					text: caption,
					title: props.shareTitle ?? card.gameName,
				})
				if (outcome === 'downloaded')
					setNotice(captionCopied ? 'share.card.downloaded' : 'share.card.saved')
				if (outcome === 'copied') setNotice('share.card.copied')
				if (outcome === 'unavailable') setNotice('share.card.unavailable')
				if (outcome === 'unavailable' || (outcome === 'downloaded' && !captionCopied))
					setRecovery(caption)
			} else {
				const outcome = await shareResultText(caption)
				if (outcome === 'copied') setNotice('common.copied')
				if (outcome === 'unavailable') {
					setNotice('share.card.unavailable')
					setRecovery(caption)
				}
			}
		} finally {
			setPending(false)
		}
	}
	const feedback = () => (
		<>
			<Show when={notice()}>{(key) => <p role="status">{t(key())}</p>}</Show>
			<Show when={recovery()}>
				{(caption) => (
					<label class="block text-sm">
						{t('share.card.caption')}
						<textarea
							rows={4}
							readOnly
							value={caption()}
							class="mt-1 w-full rounded-lg border border-border p-2"
							onFocus={(event) => event.currentTarget.select()}
						/>
					</label>
				)}
			</Show>
		</>
	)
	return (
		<>
			<button
				type="button"
				class="min-h-11 font-semibold underline"
				disabled={pending()}
				onClick={() => void share(false)}
			>
				{t('common.share')}
			</button>
			<ResultDetails locale={props.locale} model={model()}>
				<button
					type="button"
					class="min-h-11 font-semibold underline"
					disabled={pending()}
					onClick={() => void share(true)}
				>
					{t('share.card.title')} · PNG
				</button>
				{feedback()}
			</ResultDetails>
			{feedback()}
		</>
	)
}
