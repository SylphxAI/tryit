/** @jsxImportSource solid-js */
import { Check, Minus, X } from 'lucide-solid'
import {
	createResource,
	createSignal,
	createUniqueId,
	For,
	type JSX,
	onCleanup,
	Show,
} from 'solid-js'
import { Portal } from 'solid-js/web'
import { recallChallenge, sharedResultCard, toSharedResult } from '@/features/daily/lib/challenge'
import { DAILY_FREE_PICKS } from '@/features/daily/lib/daily-picks'
import {
	FIVE_RESULT_TILE_COLORS,
	type ResultCardModel,
	type ResultCardStrings,
	resultCardChips,
	resultPatternSummary,
} from '@/features/daily/lib/result-card'
import { formatResultElapsed, type resultRitual } from '@/features/daily/lib/result-ritual'
import { FinishPassLink } from '@/features/plus/solid/finish-pass-link'
import { getSharedResult } from '@/lib/connect/puzzle-client'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { localizedPath } from '@/lib/seo/urls'

import { DailyPickCount } from './daily-pick-count'
import { DailyNextLink, DailyPickSteps } from './daily-pick-ui'

export function ResultPattern(props: { model: ResultCardModel; strings: ResultCardStrings }) {
	return (
		<Show when={props.model.pattern}>
			{(pattern) => (
				<div
					class="result-preview"
					role="img"
					aria-label={resultPatternSummary(pattern(), props.strings)}
				>
					<For each={pattern()}>
						{(row) => (
							<div class="result-preview-row" aria-hidden="true">
								<For each={row}>
									{(tile) => (
										<span
											data-tile={tile}
											style={{
												'background-color':
													props.model.gameSlug === 'word-guess'
														? FIVE_RESULT_TILE_COLORS[tile]
														: undefined,
											}}
										/>
									)}
								</For>
							</div>
						)}
					</For>
				</div>
			)}
		</Show>
	)
}

export function ResultDetails(props: {
	model: ResultCardModel
	strings: ResultCardStrings
	timeSpentMs?: number | null
	difficulty?: string | null
	ritual?: ReturnType<typeof resultRitual>
	locale: Locale
	trigger: JSX.Element
	onOpenChange: (open: boolean) => void
	children: JSX.Element
}) {
	const t = createTranslator(props.locale)
	const title = createUniqueId()
	const [opened, setOpened] = createSignal(false)
	let dialog!: HTMLDialogElement
	let trigger!: HTMLButtonElement
	let heading!: HTMLHeadingElement
	onCleanup(() => {
		if (opened()) props.onOpenChange(false)
	})
	function dismiss() {
		props.onOpenChange(false)
		dialog.close()
		setOpened(false)
		trigger.focus({ preventScroll: true })
	}
	const [theirCard] = createResource(opened, async () => {
		const mine = props.model
		if (!mine.dayKey || mine.mode !== 'daily') return null
		try {
			const shareId = recallChallenge(window.localStorage, mine.gameSlug, mine.dayKey)
			if (!shareId) return null
			const result = await getSharedResult(shareId)
			if (result.status !== 'won' && result.status !== 'lost') return null
			const shared = toSharedResult(result)
			if (shared.gameSlug !== mine.gameSlug || shared.dayKey !== mine.dayKey) return null
			return sharedResultCard(shared, {
				origin: window.location.origin,
				gameName: mine.gameName,
				theme: mine.theme,
				locale: props.locale,
			})
		} catch {
			return null
		}
	})
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
	// Mount outside the completion card: the rail becomes transparent while
	// the dialog is open, and must not participate in compositing the dialog.
	const overlay = () => (
		<Portal>
			<dialog
				ref={dialog}
				aria-labelledby={title}
				class="result-dialog"
				on:cancel={(event) => {
					event.preventDefault()
					dismiss()
				}}
				// Board shortcuts live on window and must not consume dialog input (including Escape).
				on:keydown={(event) => event.stopPropagation()}
			>
				<header class="result-dialog-header" data-outcome={props.model.status}>
					<button
						type="button"
						class="result-close"
						aria-label={t('common.dismiss')}
						onClick={dismiss}
					>
						<X size={21} aria-hidden="true" />
					</button>
					<span class="completion-mark" aria-hidden="true">
						{props.model.status === 'won' ? <Check size={23} /> : <Minus size={23} />}
					</span>
					<h2 ref={heading} id={title} tabIndex={-1} class="result-dialog-title font-display">
						{t(
							props.model.status === 'won' ? 'gameResult.solvedTitle' : 'gameResult.finishedTitle',
							{
								game: props.model.gameName,
							},
						)}
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
				<Show when={opened()}>
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
					<Show when={theirCard.latest}>
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
					<Show when={opened() && props.ritual?.next}>
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
			</dialog>
		</Portal>
	)
	return (
		<>
			<button
				ref={trigger}
				type="button"
				class="result-button"
				aria-haspopup="dialog"
				onClick={() => {
					dialog.showModal()
					props.onOpenChange(true)
					setOpened(true)
					queueMicrotask(() => {
						if (dialog.open) heading.focus({ preventScroll: true })
					})
				}}
			>
				{props.trigger}
			</button>
			{overlay()}
		</>
	)
}
