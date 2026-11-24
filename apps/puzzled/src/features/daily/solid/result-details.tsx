/** @jsxImportSource solid-js */
import { ArrowRight, Check, Minus, X } from 'lucide-solid'
import {
	createEffect,
	createResource,
	createSignal,
	createUniqueId,
	For,
	type JSX,
	onCleanup,
	Show,
} from 'solid-js'
import { recallChallenge, sharedResultCard, toSharedResult } from '@/features/daily/lib/challenge'
import {
	type ResultCardModel,
	type ResultCardStrings,
	resultCardChips,
	resultCardTextAlternative,
} from '@/features/daily/lib/result-card'
import { getSharedResult } from '@/lib/connect/puzzle-client'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { localizedPath } from '@/lib/seo/urls'

export function ResultDetails(props: {
	model: ResultCardModel
	strings: ResultCardStrings
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
	const chips = (model: ResultCardModel) => (
		<dl class="result-stats">
			<For each={resultCardChips(model, props.strings)}>
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
				onClose={() => {
					setOpened(false)
					trigger.focus({ preventScroll: true })
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
				{chips(props.model)}
				<Show when={opened()}>
					<ResultPreview
						model={props.model}
						strings={props.strings}
						label={t('share.card.title')}
					/>
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
					{props.children}
					<a class="result-catalog-link" href={localizedPath(props.locale, '/games')}>
						{t('daily.backToGames')}
						<ArrowRight size={16} aria-hidden="true" />
					</a>
				</div>
			</dialog>
		</>
	)
}

function ResultPreview(props: {
	model: ResultCardModel
	strings: ResultCardStrings
	label: string
}) {
	const size = 360
	let canvas!: HTMLCanvasElement
	createEffect(() => {
		const model = props.model
		const strings = props.strings
		let stale = false
		onCleanup(() => {
			stale = true
		})
		void (async () => {
			const { paintResultCard } = await import('../lib/result-card-render')
			await document.fonts.ready
			if (stale) return
			const context = canvas.getContext('2d')
			if (!context) return
			const displayFamily = getComputedStyle(document.documentElement)
				.getPropertyValue('--font-display-family')
				.trim()
			paintResultCard(context, model, strings, { size, displayFamily: displayFamily || undefined })
			canvas.dataset.painted = ''
		})().catch(() => {
			/* The result and actions remain complete without the preview. */
		})
	})
	return (
		<figure class="result-preview">
			<canvas
				ref={canvas}
				width={size}
				height={size}
				role="img"
				aria-label={resultCardTextAlternative(props.model, props.strings)}
			/>
			<figcaption>{props.label}</figcaption>
		</figure>
	)
}
