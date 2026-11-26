/** @jsxImportSource solid-js */

import { Flame, Snowflake } from 'lucide-solid'
import { localizedPath } from '@/lib/seo/urls'
import { ConsoleCard, HonestNotice } from './console-chrome'
import type { StatsPageData } from './stats-data'
import { statsTranslator } from './stats-text'

type StreakFreezeData = Pick<StatsPageData, 'locale' | 'streakKnown' | 'streak'>

export function renderStreakFreezeCard(data: StreakFreezeData) {
	const { locale, streakKnown, streak: streakRead } = data
	const t = statsTranslator(locale)

	return (
		<ConsoleCard title={t('streakCard.title')} description={t('streakCard.description')}>
			{streakKnown ? (
				<>
					<dl class="grid grid-cols-2 gap-4">
						<div>
							<dt class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
								{t('streak')}
							</dt>
							<dd class="mt-1 font-display text-3xl tnum numeral">
								{streakRead?.currentStreak ?? 0}
							</dd>
						</div>
						<div>
							<dt class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
								{t('best')}
							</dt>
							<dd class="mt-1 font-display text-3xl tnum numeral">{streakRead?.maxStreak ?? 0}</dd>
						</div>
					</dl>
					<ul class="mt-4 space-y-2 text-sm">
						<li class="flex items-center gap-2">
							<Flame class="h-4 w-4 text-accent-warm" aria-hidden="true" />
							{streakRead?.hasPlayedToday
								? t('streakCard.playedToday')
								: t('streakCard.notPlayedToday')}
						</li>
						<li class="flex items-center gap-2">
							<Snowflake class="h-4 w-4 text-primary" aria-hidden="true" />
							{t('streakCard.freezes', { count: streakRead?.freezesAvailable ?? 0 })}
						</li>
						{streakRead?.freezeUsedYesterday ? (
							<li class="flex items-center gap-2">
								<Snowflake class="h-4 w-4 text-primary" aria-hidden="true" />
								{t('streakCard.freezeUsedYesterday')}
							</li>
						) : null}
						{streakRead && streakRead.currentStreak > 0 && streakRead.freezesAvailable < 2 ? (
							<li class="flex items-center gap-2 text-muted-foreground">
								<Snowflake class="h-4 w-4" aria-hidden="true" />
								{t('streakCard.nextFreeze', { count: streakRead.daysUntilNextFreeze })}
							</li>
						) : null}
					</ul>
					{(streakRead?.freezesAvailable ?? 0) > 0 &&
					streakRead?.autoFreezeEnabled !== undefined ? (
						<p class="mt-3 text-xs leading-relaxed text-muted-foreground">
							{streakRead.autoFreezeEnabled
								? t('streakCard.autoFreezeOn')
								: t('streakCard.autoFreezeOff')}
						</p>
					) : null}
				</>
			) : (
				<HonestNotice
					title={t('streakCard.unavailableTitle')}
					body={t('streakCard.unavailableBody')}
					action={{ href: localizedPath(locale, '/stats'), label: t.full('common.retry') }}
				/>
			)}
		</ConsoleCard>
	)
}
