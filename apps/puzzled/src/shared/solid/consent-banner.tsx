/** @jsxImportSource solid-js */
import { createSignal, onCleanup, onMount, Show } from 'solid-js'
import { cookieConsent, onConsentChange, saveCookieChoice } from '@/features/analytics/lib/consent'
import type { SiteShellData } from './site-shell-data'

type Copy = SiteShellData['consent']
const action =
	'min-h-11 rounded-lg border border-hairline bg-muted px-2 sm:min-w-24 sm:px-3 text-sm font-semibold text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2'

function useCookieConsent() {
	// Keep the server and initial hydration independent of visitor state.
	const [state, setState] = createSignal<ReturnType<typeof cookieConsent>>()
	onMount(() => {
		const update = () => setState(cookieConsent())
		update()
		onCleanup(onConsentChange(update))
	})
	return state
}

function ChoiceButtons(props: { copy: Copy; class: string; onChoose?: () => void }) {
	function choose(status: 'analytics_only' | 'granted' | 'denied') {
		saveCookieChoice(status)
		props.onChoose?.()
	}
	return (
		<div class={props.class}>
			<button type="button" class={action} onClick={() => choose('denied')}>
				{props.copy.decline}
			</button>
			<button type="button" class={action} onClick={() => choose('granted')}>
				{props.copy.accept}
			</button>
			<button type="button" class={action} onClick={() => choose('analytics_only')}>
				{props.copy.analyticsOnly}
			</button>
		</div>
	)
}

export function ConsentBanner(props: { copy: Copy }) {
	const state = useCookieConsent()
	function reserve(bar: HTMLElement) {
		const root = document.documentElement
		const update = () =>
			root.style.setProperty('--consent-bar-height', `${bar.getBoundingClientRect().height}px`)
		const observer = new ResizeObserver(update)
		observer.observe(bar)
		update()
		onCleanup(() => {
			observer.disconnect()
			root.style.removeProperty('--consent-bar-height')
		})
	}
	return (
		<Show when={state()?.prompt}>
			<section
				ref={reserve}
				class="consent-bar border-t border-hairline bg-background"
				aria-label={props.copy.title}
				data-consent-banner
			>
				<div class="page-shell-wide grid items-center gap-x-4 gap-y-1 py-1 text-sm leading-5 md:flex md:flex-wrap md:justify-between md:py-1.5">
					{/* Keep the disclosure and its link separate, so the late notice does not
					    paint as one full-width text block over the game’s initial content. */}
					<div class="flex flex-wrap items-baseline gap-x-2 text-muted-foreground max-md:justify-between">
						<p>{props.copy.message}</p>
						<a class="shrink-0 underline" href={props.copy.privacyHref}>
							{props.copy.learnMore}
						</a>
					</div>
					<ChoiceButtons copy={props.copy} class="grid grid-cols-3 gap-2 md:shrink-0" />
				</div>
			</section>
		</Show>
	)
}

/** Same preferences in the public footer and member privacy settings. */
export function CookieSettings(props: { copy: Copy }) {
	const state = useCookieConsent()
	let dialog: HTMLDialogElement | undefined
	return (
		<>
			<button
				class="inline-flex min-h-11 items-center underline-offset-4 hover:underline"
				type="button"
				onClick={() => dialog?.showModal()}
			>
				{props.copy.change}
			</button>
			<dialog
				ref={dialog}
				aria-label={props.copy.change}
				class="m-auto w-[min(28rem,calc(100%-2rem))] rounded-xl border border-hairline bg-background p-5 text-foreground backdrop:bg-black/40"
				data-cookie-settings
			>
				<div class="space-y-3">
					<h2 class="font-display text-xl font-bold">{props.copy.change}</h2>
					<p class="text-sm text-muted-foreground" role="status">
						{state()?.gpc
							? props.copy.gpc
							: state()?.marketing
								? props.copy.full
								: state()?.analytics
									? props.copy.enabled
									: props.copy.disabled}
					</p>
					<a class="block text-sm underline" href={props.copy.privacyHref}>
						{props.copy.learnMore}
					</a>
					<div class="flex flex-wrap items-center gap-2">
						<Show when={state()?.ready && state()?.storageAvailable && !state()?.gpc}>
							<ChoiceButtons
								copy={props.copy}
								class="flex flex-wrap gap-2"
								onChoose={() => dialog?.close()}
							/>
						</Show>
						<button type="button" class="min-h-11 px-3 underline" onClick={() => dialog?.close()}>
							{props.copy.close}
						</button>
					</div>
				</div>
			</dialog>
		</>
	)
}
