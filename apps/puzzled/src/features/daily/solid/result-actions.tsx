/** @jsxImportSource solid-js */
import { ChartNoAxesColumnIncreasing, Flame, Snowflake } from 'lucide-solid'
import { Show } from 'solid-js'
import { isPracticeSupported, practicePath } from '@/features/practice/lib/practice'
import { gamePath } from '@/lib/game-slug'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { localizedPath } from '@/lib/seo/urls'
import { asDifficulty } from '../lib/difficulty-completion'
import { DailyNextLink } from './daily-pick-ui'
import { PwaInstallNudge } from './pwa-install-nudge'
import { createResultDailyContext } from './result-daily-context'
import { ResultDetails, ResultPattern } from './result-details'
import { createResultShareControls } from './result-share-controls'
import { createResultShare, type ResultFacts } from './result-share-state'
import './result.css'

export function ResultActions(props: {
	facts: ResultFacts
	locale: Locale
	onDetailsOpenChange: (open: boolean) => void
	freshWin?: boolean
	isGuest?: boolean
	shareTitle?: string
	shareText?: string
}) {
	const t = createTranslator(props.locale)
	const share = createResultShare(props, t, () => percentileLabel() !== null)
	const { model, mounted, strings } = share
	const signIn = localizedPath(
		props.locale,
		`/sign-in?${new URLSearchParams({ callbackUrl: localizedPath(props.locale, '/stats') })}`,
	)
	const { percentileLabel, ritual, retention, streakCountLabel } = createResultDailyContext(
		props,
		model,
		mounted,
		t,
	)
	const { copyButton, status, dialogActions } = createResultShareControls(share, t)
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
			<Show when={retention().days !== null || retention().freezeSaved}>
				<div class="result-streak-notes">
					<Show when={retention().days !== null}>
						<p
							class="result-current-streak"
							data-result-streak
							data-result-milestone={retention().milestone ?? undefined}
						>
							<Flame size={16} aria-hidden="true" />
							{retention().milestone === null
								? streakCountLabel(retention().days ?? 0)
								: t('gameResult.streakMilestone', { days: retention().milestone })}
						</p>
					</Show>
					<Show when={retention().freezeSaved}>
						<p class="result-freeze-saved" data-result-freeze-saved>
							<Snowflake size={16} aria-hidden="true" />
							{t('gameResult.freezeSaved')}
						</p>
					</Show>
				</div>
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
				<Show when={props.facts.mode === 'daily' && isPracticeSupported(props.facts.gameSlug)}>
					<a
						class="result-button"
						href={practicePath(
							localizedPath(props.locale, gamePath(props.facts.gameSlug)),
							asDifficulty(props.facts.difficulty ?? undefined),
						)}
					>
						{t('practice.another')}
					</a>
				</Show>
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
					{dialogActions()}
					{status('dialog')}
				</ResultDetails>
			</div>
			{status('rail')}
			<Show when={retention().captureGuest}>
				<div class="result-guest-capture" data-result-guest-capture>
					<div>
						<p>
							{(retention().days ?? 0) > 0
								? t('onboarding.keepStreak', { days: retention().days })
								: t('onboarding.saveStreak')}
						</p>
						<p class="result-guest-note">{t('onboarding.saveStreakNote')}</p>
					</div>
					<a class="result-guest-link" href={signIn}>
						{t('onboarding.createFreeAccount')}
					</a>
				</div>
			</Show>
			<Show when={props.freshWin && model().status === 'won'}>
				<PwaInstallNudge locale={props.locale} />
			</Show>
		</>
	)
}
