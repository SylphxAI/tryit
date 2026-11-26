/** @jsxImportSource solid-js */
import { createResource, createSignal, createUniqueId, type JSX, onCleanup } from 'solid-js'
import { Portal } from 'solid-js/web'
import { recallChallenge, sharedResultCard, toSharedResult } from '@/features/daily/lib/challenge'
import type { ResultCardModel, ResultCardStrings } from '@/features/daily/lib/result-card'
import type { resultRitual } from '@/features/daily/lib/result-ritual'
import { getSharedResult } from '@/lib/connect/puzzle-client'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { ResultDetailsBody } from './result-details-body'

export { ResultPattern } from './result-pattern'

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
				<ResultDetailsBody
					model={props.model}
					strings={props.strings}
					timeSpentMs={props.timeSpentMs}
					difficulty={props.difficulty}
					ritual={props.ritual}
					locale={props.locale}
					t={t}
					title={title}
					headingRef={(element) => {
						heading = element
					}}
					opened={opened()}
					theirCard={theirCard.latest}
					dismiss={dismiss}
				>
					{props.children}
				</ResultDetailsBody>
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
