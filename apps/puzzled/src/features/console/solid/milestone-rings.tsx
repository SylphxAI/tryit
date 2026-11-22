/** @jsxImportSource solid-js */
import { For } from 'solid-js'
import type { AchievementTier } from '@/features/gamification/lib/achievements'
import type { Locale } from '@/lib/i18n/config'
import { ProgressRing } from '@/shared/solid/progress-ring'
import { ConsoleCard } from './console-chrome'
import { statsTranslator } from './stats-text'

export type Milestone = {
	id: string
	/** The measured metric this milestone counts. */
	metric: 'streak' | 'wins'
	tier: AchievementTier
	/** Value already reached, straight from the stats payload. */
	progress: number
	/** Value the milestone needs. */
	target: number
}

const TIER_CLASSES: Record<AchievementTier, string> = {
	bronze: 'bg-accent-warm/10 text-accent-warm-foreground',
	silver: 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
	gold: 'bg-accent-warm/15 text-accent-warm-foreground',
	platinum: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
	diamond: 'bg-muted text-foreground',
}

type MilestoneRingsCardProps = {
	locale: Locale
	milestones: readonly Milestone[]
	/** True when the totals behind the rings did not load. */
	unavailable: boolean
}

/**
 * Progress toward the next milestones, drawn from the same numbers as the
 * totals row. A ring only appears for a metric the console actually read, so
 * a missing payload can never look like a locked achievement.
 */
export function MilestoneRingsCard({ milestones, unavailable, locale }: MilestoneRingsCardProps) {
	const t = statsTranslator(locale)
	const tTier = (key: string) => t(`tier.${key}`)

	return (
		<ConsoleCard
			title={t('milestones.title')}
			description={t('milestones.description')}
			bodyClassName="px-4 py-4 md:px-5"
		>
			{unavailable ? (
				<p class="text-sm text-muted-foreground">{t('milestones.unavailable')}</p>
			) : milestones.length === 0 ? (
				<p class="text-sm text-muted-foreground">{t('milestones.caughtUp')}</p>
			) : (
				<ul class="grid gap-4 sm:grid-cols-2">
					<For each={milestones}>
						{(milestone) => {
							const label = t(`milestones.metric.${milestone.metric}`)
							const tier = tTier(milestone.tier)
							return (
								<li class="flex items-center gap-4 rounded-2xl border border-border/70 bg-surface-muted/60 p-3">
									<ProgressRing
										value={milestone.progress}
										max={milestone.target}
										size={64}
										strokeWidth={7}
										title={t('milestones.ringLabel', {
											label,
											progress: milestone.progress,
											target: milestone.target,
										})}
									/>
									<div class="min-w-0 flex-1">
										<p class="font-semibold">{label}</p>
										<p class="mt-0.5 text-sm text-muted-foreground tnum">
											{t('milestones.progress', {
												progress: milestone.progress,
												target: milestone.target,
											})}
										</p>
										<span class={`chip mt-1.5 ${TIER_CLASSES[milestone.tier]}`}>{tier}</span>
									</div>
								</li>
							)
						}}
					</For>
				</ul>
			)}
		</ConsoleCard>
	)
}
