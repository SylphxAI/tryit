/** @jsxImportSource solid-js */
import { ChartNoAxesColumnIncreasing, Flame, Snowflake, X } from 'lucide-solid'
import { createEffect, createSignal, onMount, Show } from 'solid-js'
import { isPracticeSupported, practicePath } from '@/features/practice/lib/practice'
import { gamePath } from '@/lib/game-slug'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { localizedPath } from '@/lib/seo/urls'
import { SAVE_STREAK_DISMISSED_DAY_KEY } from '@/lib/storage-keys'
import { asDifficulty } from '../lib/difficulty-completion'
import { resultRetentionPrompt } from '../lib/result-card-retention'
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
	guestStatusPending?: boolean
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
	const { percentileLabel, ritual, retention, streakCountLabel, streakPending } =
		createResultDailyContext(props, model, mounted, t)
	const [dismissedDay, setDismissedDay] = createSignal<string | null | false>()
	onMount(() => {
		try {
			setDismissedDay(localStorage.getItem(SAVE_STREAK_DISMISSED_DAY_KEY))
		} catch {
			// Don't show the offer if we can't read a previous dismissal.
			setDismissedDay(false)
		}
	})
	const [prompt, setPrompt] = createSignal<ReturnType<typeof resultRetentionPrompt>>()
	createEffect(() => {
		if (
			!mounted() ||
			props.guestStatusPending ||
			dismissedDay() === undefined ||
			prompt() !== undefined
		)
			return
		const canOfferSave =
			props.isGuest === true && dismissedDay() !== false && dismissedDay() !== props.facts.todayKey
		// Don't briefly offer install while an eligible guest's streak is still loading.
		if (canOfferSave && streakPending()) return
		setPrompt(
			resultRetentionPrompt(
				model().status,
				props.freshWin,
				canOfferSave && retention().captureGuest,
			),
		)
	})
	function dismissSaveStreak() {
		const dayKey = props.facts.todayKey
		if (!dayKey) return
		setPrompt(resultRetentionPrompt(model().status, props.freshWin, false, prompt(), true))
		try {
			localStorage.setItem(SAVE_STREAK_DISMISSED_DAY_KEY, dayKey)
		} catch {
			// Still dismissed for the current view.
		}
	}
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
			<Show
				when={model().status === 'won' && (retention().days !== null || retention().freezeSaved)}
			>
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
			<Show when={prompt() === 'save-streak'}>
				<div class="result-guest-capture" data-result-guest-capture>
					<div class="result-guest-body">
						<p class="result-guest-copy">
							{t('onboarding.keepStreak', { days: retention().days })}{' '}
							<span class="result-guest-note">{t('onboarding.saveStreakNote')}</span>
						</p>
						<a class="result-guest-link" href={signIn}>
							{t('onboarding.createFreeAccount')}
						</a>
					</div>
					<button
						type="button"
						class="result-button result-guest-dismiss"
						aria-label={t('common.dismiss')}
						onClick={dismissSaveStreak}
					>
						<X size={16} aria-hidden="true" />
					</button>
				</div>
			</Show>
			<Show when={prompt() === 'install'}>
				<PwaInstallNudge locale={props.locale} />
			</Show>
		</>
	)
}
