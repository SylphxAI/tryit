/** @jsxImportSource solid-js */
import { Lock } from 'lucide-solid'
import { createEffect, createResource, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { trackBehavioralEvent } from '@/features/analytics/lib/behavioral-events'
import type { GamePageData } from '@/features/catalog/solid/game-data'
import { playButton } from '@/features/catalog/solid/game-landing'
import { getAllGameMetadata } from '@/games/registry'
import { currencyForLocale } from '@/lib/billing/plus'
import { getTodayProgress } from '@/lib/connect/puzzle-client'
import { createTranslator } from '@/lib/i18n/translate'
import { localizedPath } from '@/lib/seo/urls'
import { ARCHIVE_WINDOW_DAYS } from '../lib/archive-days'
import {
	claimedDailyPicks,
	DAILY_FREE_PICKS,
	dailyPickCount,
	unfinishedDailyPicks,
} from '../lib/daily-picks'
import { dailyPlayerCopy } from '../lib/daily-player-copy'
import type { GameDayRequest } from '../lib/day-request'
import { DailyPickCount } from './daily-pick-count'
import { DailyNextLink } from './daily-pick-ui'
import { UnlockPlanList } from './unlock-plan-list'
import { readUnlockPrices } from './unlock-prices'

export function DailyUnlock(props: {
	data: GamePageData
	day: GameDayRequest
	todayKey: string
	resetAt: number
	isGuest?: boolean
}) {
	const { locale, catalog, canonicalPath } = props.data
	const archive = props.day.mode === 'archive'
	const t = createTranslator(locale)
	const copy = dailyPlayerCopy(locale)
	const [ready, setReady] = createSignal(false)
	const [remaining, setRemaining] = createSignal<number>()
	onMount(() => {
		if (!archive) {
			const tick = () => setRemaining(Math.max(0, props.resetAt - Date.now()))
			tick()
			const interval = setInterval(tick, 1000)
			onCleanup(() => clearInterval(interval))
		}
		setReady(true)
	})
	const [progress] = createResource(
		() => ready() && (archive || remaining() !== 0),
		async () => {
			try {
				const progress = await getTodayProgress(
					archive ? [] : getAllGameMetadata().map(({ slug }) => slug),
				)
				const picks = claimedDailyPicks(progress, props.todayKey)
				return picks
					? { count: dailyPickCount(picks), resumes: unfinishedDailyPicks(progress, picks) }
					: null
			} catch {
				return null
			}
		},
		{ initialValue: null },
	)
	const [prices] = createResource(
		() => !archive && ready(),
		() =>
			readUnlockPrices(locale).catch(() => ({ cards: [], currency: currencyForLocale(locale) })),
		{ initialValue: null },
	)
	let reported = false
	createEffect(() => {
		const is_guest = props.isGuest
		if (
			!ready() ||
			reported ||
			is_guest === undefined ||
			progress.loading ||
			prices.loading ||
			(!archive && remaining() === 0)
		)
			return
		const picks_used = archive ? progress.latest?.count : DAILY_FREE_PICKS
		if (picks_used === undefined) return
		reported = true
		trackBehavioralEvent({
			event: 'paywall_hit',
			surface: archive ? 'archive_lock' : '4th_game_lock',
			game_slug: props.data.slug,
			picks_used,
			currency: prices.latest?.currency ?? currencyForLocale(locale),
			is_guest,
		})
	})
	const callbackUrl = archive ? `${canonicalPath}?date=${props.day.puzzleDate}` : canonicalPath
	const pricingHref = localizedPath(
		locale,
		`/pricing?${new URLSearchParams({ callbackUrl, trigger: 'game_unlock' })}`,
	)
	return (
		<div
			data-unlock-panel={archive ? 'archive' : 'picks'}
			class="play-entry editorial-surface mx-auto w-full max-w-lg space-y-4 rounded-3xl p-4 sm:p-6"
		>
			<h2 class="flex items-center gap-2 font-display text-xl font-bold">
				<Lock size={20} class="shrink-0" aria-hidden="true" />
				{archive ? t('plus.unlock.archiveTitle') : t('plus.name')}
			</h2>
			<Show when={!archive && remaining() !== 0}>
				<p class="font-semibold">
					<DailyPickCount count={DAILY_FREE_PICKS} locale={locale} />
				</p>
				<Show when={remaining() !== undefined}>
					<p class="text-sm text-muted-foreground" title={t('home.day.resetsAt')}>
						<time data-reset-at={new Date(props.resetAt).toISOString()}>
							{copy.reset(remaining() ?? 0)}
						</time>
					</p>
				</Show>
				<Show when={!archive && progress.latest?.resumes.length}>
					<ul class="flex flex-wrap gap-2">
						<For each={progress.latest?.resumes}>
							{(slug) => (
								<li>
									<DailyNextLink
										class="chrome-control min-h-12 gap-2 rounded-xl border border-border px-3 font-semibold"
										slug={slug}
										locale={locale}
										dayKey={props.todayKey}
										resume
									/>
								</li>
							)}
						</For>
					</ul>
				</Show>
			</Show>
			<Show when={!archive && remaining() === 0}>
				<a class="chrome-control min-h-12" href={canonicalPath}>
					{t('common.retry')}
				</a>
			</Show>
			<Show when={!archive && remaining() !== 0}>
				<p class="text-sm text-muted-foreground">
					{t('plus.unlock.benefits', {
						count: getAllGameMetadata().length,
						days: ARCHIVE_WINDOW_DAYS,
					})}
				</p>
			</Show>
			<Show when={prices.latest}>
				{(value) => <UnlockPlanList cards={value().cards} locale={locale} />}
			</Show>
			<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
				<a class={playButton} href={pricingHref}>
					{t('plus.unlock.cta')}
				</a>
				<a class="chrome-control min-h-12 underline" href={catalog}>
					{t('plus.unlock.backToToday')}
				</a>
			</div>
		</div>
	)
}
