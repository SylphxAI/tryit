/** @jsxImportSource solid-js */
import { Lock } from 'lucide-solid'
import { createEffect, createResource, createSignal, onMount, Show } from 'solid-js'
import { trackBehavioralEvent } from '@/features/analytics/lib/behavioral-events'
import type { GamePageData } from '@/features/catalog/solid/game-data'
import { UnlockPlanList } from '@/features/daily/solid/unlock-plan-list'
import { readUnlockPrices } from '@/features/daily/solid/unlock-prices'
import { currencyForLocale } from '@/lib/billing/plus'
import { createTranslator } from '@/lib/i18n/translate'
import { localizedPath } from '@/lib/seo/urls'
import { PRACTICE_UPSELL } from '../lib/practice'
import { readPracticePicks } from './practice-picks'

export function PracticeUnlock(props: { data: GamePageData; isGuest: boolean }) {
	const { locale, canonicalPath, slug } = props.data
	const t = createTranslator(locale)
	const [mounted, setMounted] = createSignal(false)
	onMount(() => setMounted(true))
	const [prices] = createResource(mounted, () =>
		readUnlockPrices(locale).catch(() => ({ cards: [], currency: undefined })),
	)
	const [picks] = createResource(mounted, () =>
		readPracticePicks(props.isGuest).catch(() => undefined),
	)
	let reported = false
	createEffect(() => {
		const picksUsed = picks.latest
		if (reported || prices.loading || picksUsed === undefined) return
		reported = true
		trackBehavioralEvent({
			event: 'paywall_hit',
			surface: PRACTICE_UPSELL,
			game_slug: slug,
			picks_used: picksUsed,
			currency: prices.latest?.currency ?? currencyForLocale(locale),
			is_guest: props.isGuest,
		})
	})
	return (
		<div
			data-unlock-panel="practice"
			class="editorial-surface w-full space-y-4 rounded-3xl p-4 sm:p-6"
		>
			<span class="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-sm font-bold">
				<Lock size={15} aria-hidden="true" />
				{t('plus.name')}
			</span>
			<h3 class="font-display text-2xl leading-tight font-bold text-balance">
				{t('practice.unlockTitle')}
			</h3>
			<p class="text-muted-foreground">{t('practice.unlockBody')}</p>
			<Show when={prices.latest}>
				{(value) => <UnlockPlanList cards={value().cards} locale={locale} />}
			</Show>
			<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
				<a
					class="chrome-control chrome-primary min-h-12 px-5 font-bold"
					href={localizedPath(locale, `/pricing?trigger=${PRACTICE_UPSELL}`)}
				>
					{t('plus.unlock.cta')}
				</a>
				<a class="chrome-control min-h-12 underline" href={`${canonicalPath}#play`}>
					{t('practice.backToToday')}
				</a>
			</div>
		</div>
	)
}
