/** @jsxImportSource solid-js */
import { ArrowRight, Check, Minus, X } from 'lucide-solid'
import { createResource, createSignal, createUniqueId, For, type JSX, Show } from 'solid-js'
import { recallChallenge, sharedResultCard, toSharedResult } from '@/features/daily/lib/challenge'
import { DAILY_FREE_PICKS } from '@/features/daily/lib/daily-picks'
import { deriveHomeExposure } from '@/features/daily/lib/home-exposure'
import {
	type ResultCardModel,
	type ResultCardStrings,
	resultCardChips,
} from '@/features/daily/lib/result-card'
import { formatResultElapsed, resultRitual } from '@/features/daily/lib/result-ritual'
import { markStartIntent } from '@/features/daily/lib/start-intent'
import { todayPlayPath } from '@/features/daily/lib/today-play-path'
import { FinishPassLink } from '@/features/plus/solid/finish-pass-link'
import { getAllGameMetadata } from '@/games/registry'
import { getSharedResult, getTodayProgress } from '@/lib/connect/puzzle-client'
import { freeGameForDayKey } from '@/lib/free-rotation'
import { slugToCamelCase } from '@/lib/game-slug'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { localizedPath } from '@/lib/seo/urls'

export function ResultDetails(props: {
	model: ResultCardModel
	strings: ResultCardStrings
	timeSpentMs?: number | null
	difficulty?: string | null
	locale: Locale
	trigger: JSX.Element
	children: JSX.Element
}) {
	const t = createTranslator(props.locale)
	const title = createUniqueId()
	const [opened, setOpened] = createSignal(false)
	let dialog!: HTMLDialogElement
	let trigger!: HTMLButtonElement
	let heading!: HTMLHeadingElement
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
	const [ritual] = createResource(
		() => (opened() && props.model.mode === 'daily' ? props.model.dayKey : null),
		async (dayKey) => {
			const modules = getAllGameMetadata()
			try {
				const progress = await getTodayProgress(modules.map(({ slug }) => slug))
				const { slugs } = deriveHomeExposure({
					modules,
					dayKey,
					freeGameSlug: freeGameForDayKey(dayKey),
					completions: {},
					limit: modules.length,
				})
				return resultRitual(progress, dayKey, props.model.gameSlug, slugs)
			} catch {
				return null
			}
		},
		{ initialValue: null },
	)
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
			<button
				ref={trigger}
				type="button"
				class="result-button"
				aria-haspopup="dialog"
				onClick={() => {
					dialog.showModal()
					dialog.closest('.completion-card')?.setAttribute('data-result-open', '')
					setOpened(true)
					queueMicrotask(() => {
						if (dialog.open) heading.focus({ preventScroll: true })
					})
				}}
			>
				{props.trigger}
			</button>
			<dialog
				ref={dialog}
				aria-labelledby={title}
				class="result-dialog"
				on:close={() => {
					setOpened(false)
					dialog.closest('.completion-card')?.removeAttribute('data-result-open')
					requestAnimationFrame(() => {
						if (!dialog.open && trigger.isConnected) trigger.focus({ preventScroll: true })
					})
				}}
				// Board shortcuts live on window and must not consume dialog input (including Escape).
				on:keydown={(event) => event.stopPropagation()}
			>
				<header class="result-dialog-header" data-outcome={props.model.status}>
					<form method="dialog">
						<button type="submit" class="result-close" aria-label={t('common.dismiss')}>
							<X size={21} aria-hidden="true" />
						</button>
					</form>
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
				<Show when={opened()}>
					<Show when={!ritual.loading && ritual.latest}>
						{(today) => (
							<div class="result-ritual" data-ritual-completed={today().completed}>
								<div class="result-ritual-head">
									<p>
										{t('gameResult.freeProgress', {
											done: today().completed,
											total: DAILY_FREE_PICKS,
										})}
									</p>
									<span class="result-steps" aria-hidden="true">
										<For each={Array.from({ length: DAILY_FREE_PICKS })}>
											{(_, i) => <span data-filled={i() < today().completed || undefined} />}
										</For>
									</span>
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
					<Show when={opened() && !ritual.loading && ritual.latest?.next}>
						{(slug) => (
							<a
								class="result-button result-next"
								href={localizedPath(props.locale, todayPlayPath(slug()))}
								onClick={(event) => {
									if (
										!event.defaultPrevented &&
										!event.ctrlKey &&
										!event.metaKey &&
										!event.shiftKey &&
										!event.altKey
									)
										markStartIntent(slug())
								}}
							>
								{t(ritual.latest?.resume ? 'gameResult.resumeNext' : 'gameResult.playNext', {
									game: t(`games.${slugToCamelCase(slug())}.name`),
								})}
								<ArrowRight size={18} aria-hidden="true" />
							</a>
						)}
					</Show>
					{props.children}
					<a class="result-catalog-link" href={localizedPath(props.locale, '/games')}>
						{t('catalog.title')}
					</a>
				</div>
			</dialog>
		</>
	)
}
