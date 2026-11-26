/** @jsxImportSource solid-js */
import { Check, Minus, X } from 'lucide-solid'
import { For, type JSX, Show } from 'solid-js'
import { DAILY_FREE_PICKS } from '@/features/daily/lib/daily-picks'
import {
	type ResultCardModel,
	type ResultCardStrings,
	resultCardChips,
} from '@/features/daily/lib/result-card'
import { formatResultElapsed, type resultRitual } from '@/features/daily/lib/result-ritual'
import { FinishPassLink } from '@/features/plus/solid/finish-pass-link'
import type { Locale } from '@/lib/i18n/config'
import type { Translate } from '@/lib/i18n/translate'
import { localizedPath } from '@/lib/seo/urls'
import { DailyPickCount } from './daily-pick-count'
import { DailyNextLink, DailyPickSteps } from './daily-pick-ui'
import { ResultPattern } from './result-pattern'

export function ResultDetailsBody(props: {
	model: ResultCardModel
	strings: ResultCardStrings
	timeSpentMs?: number | null
	difficulty?: string | null
	ritual?: ReturnType<typeof resultRitual>
	locale: Locale
	children: JSX.Element
	t: Translate
	title: string
	headingRef: (heading: HTMLHeadingElement) => void
	opened: boolean
	theirCard?: ResultCardModel | null
	dismiss: () => void
}) {
	const t = props.t
	const chips = (model: ResultCardModel, exactTime?: string | null) => (
		<dl class="result-stats">
			<For
				each={
					exactTime === undefined
						? resultCardChips(model, props.strings)
						: [
								...resultCardChips({ ...model, timeBand: null }, props.strings),
								...(exactTime === null
									? []
									: [{ label: props.strings.timeLabel, value: exactTime }]),
							]
				}
			>
				{(chip) => (
					<div>
						<dt>{chip.label}</dt>
						<dd data-time={chip.label === props.strings.timeLabel || undefined}>{chip.value}</dd>
					</div>
				)}
			</For>
		</dl>
	)
	return (
		<>
			<header class="result-dialog-header" data-outcome={props.model.status}>
				<button
					type="button"
					class="result-close"
					aria-label={t('common.dismiss')}
					onClick={props.dismiss}
				>
					<X size={21} aria-hidden="true" />
				</button>
				<span class="completion-mark" aria-hidden="true">
					{props.model.status === 'won' ? <Check size={23} /> : <Minus size={23} />}
				</span>
				<h2
					ref={props.headingRef}
					id={props.title}
					tabIndex={-1}
					class="result-dialog-title font-display"
				>
					{t(props.model.status === 'won' ? 'gameResult.solvedTitle' : 'gameResult.finishedTitle', {
						game: props.model.gameName,
					})}
				</h2>
				<Show when={props.model.dayDisplay || props.difficulty}>
					<p class="result-date">
						<Show when={props.model.dayDisplay}>
							<time datetime={props.model.dayKey ?? undefined}>{props.model.dayDisplay}</time>
						</Show>
						<Show when={props.difficulty}>
							<span>{t(`common.difficulty.${props.difficulty}`)}</span>
						</Show>
					</p>
				</Show>
			</header>
			{chips(props.model, formatResultElapsed(props.timeSpentMs))}
			<ResultPattern model={props.model} strings={props.strings} />
			<Show when={props.opened}>
				<Show when={props.ritual}>
					{(today) => (
						<div class="result-ritual" data-ritual-completed={today().completed}>
							<div class="result-ritual-head">
								<DailyPickCount locale={props.locale} count={today().used} />
								<DailyPickSteps class="result-steps" count={today().used} />
							</div>
							<Show when={today().completed === DAILY_FREE_PICKS}>
								<p class="result-ritual-warm">{t('gameResult.freeFinished')}</p>
								<FinishPassLink locale={props.locale} />
							</Show>
						</div>
					)}
				</Show>
				<Show when={props.theirCard}>
					{(theirs) => (
						<section class="result-comparison" aria-label={t('share.challenge.title')}>
							<h3>{t('share.challenge.title')}</h3>
							<p>
								{t('share.challenge.theirs')} ·{' '}
								{theirs().status === 'won' ? props.strings.statusWon : props.strings.statusLost}
							</p>
							{chips(theirs())}
						</section>
					)}
				</Show>
			</Show>
			<div class="result-dialog-actions">
				<Show when={props.opened && props.ritual?.next}>
					{(slug) => (
						<DailyNextLink
							class="result-button result-next"
							slug={slug()}
							dayKey={props.model.dayKey ?? ''}
							locale={props.locale}
							resume={props.ritual?.resume === true}
						/>
					)}
				</Show>
				{props.children}
				<a class="result-catalog-link" href={localizedPath(props.locale, '/games')}>
					{t('catalog.title')}
				</a>
			</div>
		</>
	)
}
