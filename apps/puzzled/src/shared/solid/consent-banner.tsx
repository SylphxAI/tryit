/** @jsxImportSource solid-js */
import { createSignal, onCleanup, onMount, Show } from 'solid-js'
import { cookieConsent, onConsentChange, saveCookieChoice } from '@/features/analytics/lib/consent'
import type { SiteShellData } from './site-shell-data'

type Copy = SiteShellData['consent']
const action =
	'chrome-control border border-muted-foreground/70 bg-background px-1.5 text-xs sm:min-w-24 sm:px-3 sm:text-sm'

// Each mounted tray owns the dock marker until it unmounts.
let dockOwners = 0

/** Carry the reading position across a switch between window and shell scrolling. */
function keepScroll(change: () => void) {
	// The bar's ref runs before it is attached, so find the page's one shell now.
	const shell = document.querySelector<HTMLElement>('.site-shell')
	const inner = () => !!shell && getComputedStyle(shell).overflowY !== 'visible'
	const before = inner()
	const y = before && shell ? shell.scrollTop : window.scrollY
	change()
	const after = inner()
	if (before === after || !shell) return
	if (after) shell.scrollTop = y
	else window.scrollTo(0, y)
}

/** Browsers restore only window scroll on Back, so keep the shell's offset in the history entry. */
function rememberShellScroll() {
	const shell = document.querySelector<HTMLElement>('.site-shell')
	if (!shell || getComputedStyle(shell).overflowY === 'visible') return () => {}
	const saved = Number((history.state as { consentShellY?: unknown } | null)?.consentShellY)
	if (saved > 0) shell.scrollTop = saved
	let timer: number | undefined
	const save = () => {
		const href = location.href
		clearTimeout(timer)
		timer = window.setTimeout(() => {
			// Never write this page's offset into the entry a navigation just opened.
			if (!shell.isConnected || location.href !== href) return
			history.replaceState({ ...history.state, consentShellY: shell.scrollTop }, '')
		}, 150)
	}
	shell.addEventListener('scroll', save, { passive: true })
	return () => {
		clearTimeout(timer)
		shell.removeEventListener('scroll', save)
	}
}

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

function ChoiceButtons(props: {
	copy: Copy
	class: string
	onChoose?: () => void
	banner?: boolean
}) {
	function choose(status: 'analytics_only' | 'granted' | 'denied') {
		saveCookieChoice(status)
		props.onChoose?.()
	}
	return (
		<div class={props.class} data-consent-choices={props.banner ? '' : undefined}>
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
		const token = String(++dockOwners)
		const update = () =>
			root.style.setProperty('--consent-bar-height', `${bar.getBoundingClientRect().height}px`)
		const observer = new ResizeObserver(update)
		observer.observe(bar)
		// While the tray is up the shell scrolls above it, so no card paints behind it.
		keepScroll(() => {
			root.dataset.consentDock = token
			update()
		})
		const forget = rememberShellScroll()
		onCleanup(() => {
			forget()
			observer.disconnect()
			if (root.dataset.consentDock !== token) return
			keepScroll(() => {
				delete root.dataset.consentDock
				root.style.removeProperty('--consent-bar-height')
			})
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
				<div class="page-shell-wide flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5 py-1">
					<div class="flex w-full flex-wrap items-baseline justify-between gap-x-2 md:w-auto md:justify-start">
						<p class="text-xs leading-4 text-muted-foreground sm:text-sm">{props.copy.message}</p>
						<a
							class="consent-privacy text-xs underline underline-offset-2"
							href={props.copy.privacyHref}
						>
							{props.copy.learnMore}
						</a>
						<CookieSettings
							copy={props.copy}
							triggerClass="consent-privacy text-xs underline underline-offset-2"
						/>
					</div>
					<ChoiceButtons
						copy={props.copy}
						class="grid w-full grid-cols-3 gap-1.5 md:w-auto"
						banner
					/>
				</div>
			</section>
		</Show>
	)
}

/** Same preferences in the public footer and member privacy settings. */
export function CookieSettings(props: { copy: Copy; triggerClass?: string }) {
	const state = useCookieConsent()
	let dialog: HTMLDialogElement | undefined
	return (
		<>
			<button
				class={
					props.triggerClass ??
					'inline-flex min-h-11 items-center underline-offset-4 hover:underline'
				}
				type="button"
				onClick={() => dialog?.showModal()}
			>
				{props.copy.change}
			</button>
			<dialog
				ref={dialog}
				aria-label={props.copy.change}
				class="chrome-dialog"
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
					<p class="text-sm text-muted-foreground" data-consent-providers>
						{props.copy.providers}
					</p>
					<a class="chrome-control text-sm" href={props.copy.privacyHref}>
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
						<button
							type="button"
							class="chrome-control border border-hairline px-3"
							onClick={() => dialog?.close()}
						>
							{props.copy.close}
						</button>
					</div>
				</div>
			</dialog>
		</>
	)
}
