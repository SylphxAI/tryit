/** @jsxImportSource solid-js */
import { X } from 'lucide-solid'
import { createEffect, onCleanup } from 'solid-js'
import type { Translate } from '@/lib/i18n/translate'

const exposureRatio = 0.75
const exposureMs = 400

export function FirstMoveCue(props: {
	t: Translate
	dismiss: () => void
	visible: boolean
	onExposure: () => void
}) {
	let cue!: HTMLDivElement
	createEffect(() => {
		if (!props.visible || typeof IntersectionObserver === 'undefined') return
		let observer: IntersectionObserver | undefined
		let dwell: ReturnType<typeof setTimeout> | undefined
		const stopObserving = () => {
			observer?.disconnect()
			observer = undefined
			clearTimeout(dwell)
			dwell = undefined
		}
		const observeVisibleTab = () => {
			stopObserving()
			if (document.visibilityState !== 'visible') return
			observer = new IntersectionObserver(
				(entries, source) => {
					if (observer !== source || document.visibilityState !== 'visible') return
					const latest = entries.at(-1)
					if (!latest?.isIntersecting || latest.intersectionRatio < exposureRatio) {
						clearTimeout(dwell)
						dwell = undefined
						return
					}
					dwell ??= setTimeout(() => {
						if (document.visibilityState !== 'visible') return
						stopObserving()
						document.removeEventListener('visibilitychange', observeVisibleTab)
						props.onExposure()
					}, exposureMs)
				},
				{ threshold: exposureRatio },
			)
			observer.observe(cue)
		}
		document.addEventListener('visibilitychange', observeVisibleTab)
		observeVisibleTab()
		onCleanup(() => {
			stopObserving()
			document.removeEventListener('visibilitychange', observeVisibleTab)
		})
	})
	return (
		<div
			ref={cue}
			class="play-meta mt-1 flex items-center gap-2 rounded-xl border border-accent-warm bg-accent-warm-soft ps-2 text-sm leading-tight sm:gap-3 sm:ps-3"
			classList={{ invisible: !props.visible }}
			inert={!props.visible}
			data-cage-first-move
		>
			<div class="shrink-0 text-center">
				<span class="sr-only">{props.t('games.killerSudoku.firstMove.example')}: 3 + 5 = 8</span>
				<div aria-hidden="true" class="pb-0.5 text-[10px] font-semibold leading-none">
					{props.t('games.killerSudoku.firstMove.example')}
				</div>
				<div
					class="relative grid h-8 w-14 grid-cols-2 items-end rounded border border-dashed border-accent-warm-foreground bg-card pb-0.5 font-bold"
					aria-hidden="true"
				>
					<span class="absolute start-1 top-0.5 text-[11px] leading-none">8</span>
					<span class="border-e border-hairline">3</span>
					<span>5</span>
				</div>
			</div>
			<p class="min-w-0 flex-1 text-[13px] sm:text-sm" data-first-action>
				{props.t('games.killerSudoku.firstMove.sum')}
				<strong class="block">{props.t('games.killerSudoku.firstMove.action')}</strong>
			</p>
			<button
				type="button"
				class="grid size-12 shrink-0 place-items-center rounded-lg hover:bg-card"
				aria-label={props.t('common.dismiss')}
				onClick={props.dismiss}
			>
				<X size={18} aria-hidden="true" />
			</button>
		</div>
	)
}
