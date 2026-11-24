/** @jsxImportSource solid-js */
import { createResource, createUniqueId, For, Show } from 'solid-js'
import { recallChallenge, sharedResultCard, toSharedResult } from '@/features/daily/lib/challenge'
import {
	type ResultCardModel,
	resultCardChips,
	resultCardStringsFrom,
} from '@/features/daily/lib/result-card'
import { getSharedResult } from '@/lib/connect/puzzle-client'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'

export function ResultDetails(props: {
	model: ResultCardModel
	locale: Locale
	children: import('solid-js').JSX.Element
}) {
	const t = createTranslator(props.locale)
	const strings = resultCardStringsFrom((key) => String(t.raw(`share.card.${key}`)))
	const title = createUniqueId()
	let dialog!: HTMLDialogElement
	const [theirCard] = createResource(async () => {
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
		<dl class="space-y-2 text-sm">
			<For each={resultCardChips(model, strings)}>
				{(chip) => (
					<div>
						<dt class="text-muted-foreground">{chip.label}</dt>
						<dd class="font-semibold">{chip.value}</dd>
					</div>
				)}
			</For>
		</dl>
	)
	return (
		<>
			<button
				type="button"
				class="min-h-11 min-w-11 rounded-lg border border-hairline px-3 text-sm font-semibold hover:bg-accent"
				onClick={() => dialog.showModal()}
			>
				{t('gameResult.seeResult')}
			</button>
			<dialog
				ref={dialog}
				aria-labelledby={title}
				class="fixed inset-0 m-auto max-h-[min(85dvh,calc(100dvh-var(--spacing-safe-top)-var(--spacing-safe-bottom)-2rem))] w-[calc(100%-2rem)] max-w-sm overflow-auto rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-lg backdrop:bg-black/50"
			>
				<form method="dialog" class="flex justify-end">
					<button type="submit" class="min-h-11 font-semibold underline">
						{t('common.dismiss')}
					</button>
				</form>
				<h2 id={title} class="mb-3 font-display text-xl">
					{t('gameResult.seeResult')}
				</h2>
				<Show when={theirCard()} fallback={chips(props.model)}>
					{(theirs) => (
						<section aria-label={t('share.challenge.title')}>
							<h3 class="mb-2 font-semibold">{t('share.challenge.title')}</h3>
							<div class="grid grid-cols-2 gap-2">
								<For
									each={[
										{ heading: t('share.challenge.theirs'), model: theirs() },
										{ heading: t('share.challenge.yours'), model: props.model },
									]}
								>
									{(card) => (
										<div class="rounded-xl border border-border p-3">
											<h4 class="font-semibold">{card.heading}</h4>
											<p class="mb-2">
												{card.model.status === 'won' ? strings.statusWon : strings.statusLost}
											</p>
											{chips(card.model)}
										</div>
									)}
								</For>
							</div>
						</section>
					)}
				</Show>
				<div class="mt-4">{props.children}</div>
			</dialog>
		</>
	)
}
