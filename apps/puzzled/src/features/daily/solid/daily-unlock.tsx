/** @jsxImportSource solid-js */
import { Lock } from 'lucide-solid'
import { createResource, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import type { GamePageData } from '@/features/catalog/solid/game-data'
import { playButton } from '@/features/catalog/solid/game-landing'
import { getAllGameMetadata } from '@/games/registry'
import { formatPrice } from '@/lib/billing/plus'
import { getTodayProgress } from '@/lib/connect/puzzle-client'
import { createTranslator } from '@/lib/i18n/translate'
import { localizedPath } from '@/lib/seo/urls'
import { claimedDailyPicks, DAILY_FREE_PICKS, unfinishedDailyPicks } from '../lib/daily-picks'
import { dailyPlayerCopy } from '../lib/daily-player-copy'
import type { GameDayRequest } from '../lib/day-request'
import { DailyPickCount } from './daily-pick-count'
import { DailyNextLink } from './daily-pick-ui'
import { readUnlockPrices } from './unlock-prices'

export function DailyUnlock(props: {
	data: GamePageData
	day: GameDayRequest
	todayKey: string
	resetAt: number
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
	const [resumes] = createResource(
		() => !archive && ready() && remaining() !== 0,
		async () => {
			try {
				const progress = await getTodayProgress(getAllGameMetadata().map(({ slug }) => slug))
				const picks = claimedDailyPicks(progress, props.todayKey)
				return picks ? unfinishedDailyPicks(progress, picks) : []
			} catch {
				return []
			}
		},
		{ initialValue: [] },
	)
	const [prices] = createResource(
		() => !archive && ready(),
		() => readUnlockPrices(locale).catch(() => []),
		{ initialValue: null },
	)
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
				<Show when={resumes.latest?.length}>
					<ul class="flex flex-wrap gap-2">
						<For each={resumes.latest}>
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
			<Show
				when={prices.latest?.length}
				fallback={
					<Show when={prices.latest}>
						<p class="text-sm text-muted-foreground">{t('plus.pricing.unavailableTitle')}</p>
					</Show>
				}
			>
				<dl class="grid gap-1 rounded-xl bg-muted p-3 text-sm">
					<For each={prices.latest}>
						{(card) => (
							<div class="flex justify-between gap-3" data-unlock-plan={card.id}>
								<dt>
									{card.interval === 'once'
										? t('plus.pricing.weekendPass', { days: card.accessDays })
										: t(card.interval === 'year' ? 'plus.pricing.yearly' : 'plus.pricing.monthly')}
								</dt>
								<dd class="text-end font-semibold tnum">
									{formatPrice(card.amountMinor, card.currency, locale)}
								</dd>
							</div>
						)}
					</For>
				</dl>
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
