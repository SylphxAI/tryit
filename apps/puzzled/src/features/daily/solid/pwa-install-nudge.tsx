/** @jsxImportSource solid-js */
import { Smartphone, X } from 'lucide-solid'
import { createEffect, createSignal, onCleanup, onMount, Show } from 'solid-js'
import { type PwaPlatform, trackBehavioralEvent } from '@/features/analytics/lib/behavioral-events'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { PWA_PROMPT_DISMISSED_KEY } from '@/lib/storage-keys'
import {
	type BeforeInstallPromptEvent,
	clearInstallPrompt,
	getInstallPrompt,
	onInstallPrompt,
} from '@/shared/components/pwa-install-event'
import { dailyPlayerCopy } from '../lib/daily-player-copy'

export function PwaInstallNudge(props: { locale: Locale; isGuest?: boolean }) {
	const copy = dailyPlayerCopy(props.locale)
	const t = createTranslator(props.locale)
	const [available, setAvailable] = createSignal(false)
	const [ios, setIos] = createSignal(false)
	const [prompt, setPrompt] = createSignal<BeforeInstallPromptEvent | null>(null)
	let prompted: PwaPlatform | undefined
	let installed = false
	const platform = () => (prompt() ? 'chromium' : ios() ? 'ios_guide' : undefined)
	createEffect(() => {
		if (!available() || prompted) return
		const visible = platform()
		if (!visible) return
		prompted = visible
		trackBehavioralEvent({
			event: 'pwa_install_prompted',
			platform: visible,
			trigger: 'post_first_win',
			is_guest: props.isGuest,
		})
	})
	function recordInstalled(platform: PwaPlatform) {
		if (installed) return
		installed = true
		trackBehavioralEvent({
			event: 'pwa_installed',
			platform,
			trigger: 'post_first_win',
			is_guest: props.isGuest,
		})
	}
	function onInstalled() {
		if (prompted) recordInstalled(platform() ?? prompted)
		dismiss()
	}
	onMount(() => {
		try {
			if (localStorage.getItem(PWA_PROMPT_DISMISSED_KEY)) return
		} catch {
			return // Don't offer if we can't remember a dismissal.
		}
		const mode = window.matchMedia('(display-mode: standalone)')
		const nav = navigator as Navigator & { standalone?: boolean }
		const sync = () => setAvailable(!mode.matches && !nav.standalone)
		sync()
		mode.addEventListener('change', sync)
		const ua = nav.userAgent
		const appleMobile =
			/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1)
		setIos(appleMobile && /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua))
		setPrompt(getInstallPrompt())
		const stop = onInstallPrompt(setPrompt)
		window.addEventListener('appinstalled', onInstalled)
		onCleanup(() => {
			stop()
			mode.removeEventListener('change', sync)
			window.removeEventListener('appinstalled', onInstalled)
		})
	})
	function dismiss() {
		setAvailable(false)
		try {
			localStorage.setItem(PWA_PROMPT_DISMISSED_KEY, '1')
		} catch {
			/* Hidden on this page. */
		}
	}
	async function install() {
		const event = prompt()
		if (!event) return
		clearInstallPrompt()
		dismiss()
		try {
			await event.prompt()
			if ((await event.userChoice).outcome === 'accepted') recordInstalled('chromium')
		} catch {
			/* Browser cancelled or declined the native prompt. */
		}
	}
	return (
		<Show when={available() && (prompt() || ios())}>
			<aside class="result-install" aria-label={copy.install} data-install-nudge>
				<div>
					<p class="flex items-center gap-2 font-bold">
						<Smartphone size={16} aria-hidden="true" />
						{copy.install}
					</p>
					<Show when={ios() && !prompt()}>
						<p>{copy.ios}</p>
					</Show>
					<p>{copy.reminders}</p>
					<Show when={prompt()}>
						<button class="result-button mt-2" type="button" onClick={() => void install()}>
							{t('pwa.installButton')}
						</button>
					</Show>
				</div>
				<button
					type="button"
					class="result-button self-start"
					aria-label={t('common.dismiss')}
					onClick={dismiss}
				>
					<X size={16} aria-hidden="true" />
				</button>
			</aside>
		</Show>
	)
}
