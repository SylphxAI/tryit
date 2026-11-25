/** @jsxImportSource solid-js */
import { isFieldSet } from '@bufbuild/protobuf'
import { ChartNoAxesColumnIncreasing, Copy, Download, Flame } from 'lucide-solid'
import { createMemo, createResource, createSignal, onCleanup, onMount, Show } from 'solid-js'
import { getAllGameMetadata, getGameMetadata } from '@/games/registry'
import { GetTodayPercentileResponseSchema } from '@/gen/connect/puzzled/v1/stats_pb'
import { createGamificationServiceClient } from '@/lib/connect/gamification-client'
import { getTodayProgress, shareResult } from '@/lib/connect/puzzle-client'
import { getTodayPercentile } from '@/lib/connect/stats-client'
import { freeGameForDayKey } from '@/lib/free-rotation'
import { slugToCamelCase } from '@/lib/game-slug'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { deriveHomeExposure } from '../lib/home-exposure'
import {
	buildResultCard,
	parseResultPattern,
	type ResultCardInput,
	resultCardStringsFrom,
	resultCardTextAlternative,
	resultPercentileLabel,
} from '../lib/result-card'
import { resultRitual } from '../lib/result-ritual'
import { shareResultText } from '../lib/result-share'
import { DailyNextLink } from './daily-pick-ui'
import { PwaInstallNudge } from './pwa-install-nudge'
import { ResultDetails, ResultPattern } from './result-details'
import './result.css'

type Facts = Pick<
	ResultCardInput,
	'gameSlug' | 'mode' | 'status' | 'puzzleDate' | 'todayKey' | 'attempts' | 'score' | 'timeSpentMs'
> & { difficulty?: string | null }

type Surface = 'rail' | 'dialog'

export function ResultActions(props: {
	facts: Facts
	locale: Locale
	onDetailsOpenChange: (open: boolean) => void
	freshWin?: boolean
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
	const t = createTranslator(props.locale)
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
	const ritualDay = createMemo(() => {
		const current = model()
		return mounted() && current.mode === 'daily' && current.dayKey === props.facts.todayKey
			? current.dayKey
			: undefined
	})
	const won = createMemo(() => model().status === 'won')
	const percentileGame = createMemo(() => props.facts.gameSlug)
	const percentileInput = createMemo(() => {
		const dayKey = ritualDay()
		return dayKey && won() ? { dayKey, gameSlug: percentileGame() } : false
	})
	const [percentile] = createResource(
		percentileInput,
		async (input) => {
			try {
				const response = await getTodayPercentile(input)
				// Protobuf getters return 0 even when the wire field was absent.
				return isFieldSet(response, GetTodayPercentileResponseSchema.field.percentile)
					? response.percentile
					: null
			} catch {
				return null
			}
		},
		{ initialValue: null },
	)
	const percentileLabel = () =>
		percentileInput() && !percentile.loading
			? resultPercentileLabel(percentile.latest ?? undefined, props.locale, (percent) =>
					t('gameResult.todayPercentile', { percent }),
				)
			: null
	const [ritual] = createResource(
		ritualDay,
		async (dayKey) => {
			try {
				const modules = getAllGameMetadata()
				const progress = await getTodayProgress(modules.map(({ slug }) => slug))
				const { slugs } = deriveHomeExposure({
					modules,
					dayKey,
					freeGameSlug: freeGameForDayKey(dayKey),
					completions: {},
					limit: modules.length,
				})
				return resultRitual(progress, dayKey, props.facts.gameSlug, slugs)
			} catch {
				return null
			}
		},
		{ initialValue: null },
	)
	const [streak] = createResource(
		() => ritualDay() && model().status === 'won',
		async () => {
			try {
				const response = await createGamificationServiceClient().getStreakInfo({})
				return response.info?.currentStreak ?? null
			} catch {
				return null
			}
		},
		{ initialValue: null },
	)
	async function copyChallenge(surface: Surface) {
		if (pending()) return
		setPending(true)
		setFeedback(undefined)
		try {
			let card = model()
			if (card.mode === 'daily' && card.dayKey) {
				const tap = shareResult({
					gameSlug: card.gameSlug,
					puzzleDate: card.dayKey,
					tap: true,
				}).catch(() => undefined)
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
			const outcome = await shareResultText(caption, { preferClipboard: true })
			if (outcome === 'copied') setFeedback({ surface, message: 'gameResult.challengeCopied' })
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
	const copyButton = (surface: Surface) => (
		<button
			type="button"
			class="result-button result-copy"
			aria-disabled={pending() || undefined}
			onClick={() => void copyChallenge(surface)}
		>
			<Copy size={16} aria-hidden="true" />
			{t('gameResult.copyChallenge')}
		</button>
	)
	return (
		<>
			<ResultPattern model={model()} strings={strings} />
			<Show when={percentileLabel()}>
				{(label) => (
					<p class="result-percentile" data-result-percentile>
						{label()}
					</p>
				)}
			</Show>
			<Show when={streak.latest !== null}>
				<p class="result-current-streak" data-result-streak>
					<Flame size={16} aria-hidden="true" />
					{t('streak.currentStreak')}:{' '}
					{new Intl.NumberFormat(props.locale).format(streak.latest ?? 0)}
				</p>
			</Show>
			<Show when={ritual.latest?.next}>
				{(slug) => (
					<DailyNextLink
						class="result-button result-next"
						slug={slug()}
						dayKey={props.facts.todayKey ?? ''}
						locale={props.locale}
						resume={ritual.latest?.resume === true}
					/>
				)}
			</Show>
			<div class="result-action-row">
				{copyButton('rail')}
				<ResultDetails
					locale={props.locale}
					onOpenChange={props.onDetailsOpenChange}
					model={model()}
					strings={strings}
					timeSpentMs={props.facts.timeSpentMs}
					difficulty={props.facts.difficulty}
					ritual={ritual.latest}
					trigger={
						<>
							<ChartNoAxesColumnIncreasing size={16} aria-hidden="true" />
							{t('gameResult.seeResult')}
						</>
					}
				>
					<div class="result-action-row">
						{copyButton('dialog')}
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
			<Show when={props.freshWin && model().status === 'won'}>
				<PwaInstallNudge locale={props.locale} />
			</Show>
		</>
	)
}
