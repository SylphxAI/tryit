/** @jsxImportSource solid-js */
import { createEffect, createSignal, onCleanup, onMount, Show } from 'solid-js'
import { PwaInstallNudge } from '@/features/daily/solid/pwa-install-nudge'
import type { Locale } from '@/lib/i18n/config'
import { observeDayPrimaryActions } from '@/shared/components/observe-day-primary-actions'
import {
	isInstallOfferEligible,
	isServerDayCurrent,
	readFirstFinishDay,
	shouldShowInstallOffer,
} from '@/shared/components/pwa-install-policy'
import './home-install-offer.css'

/**
 * The install offer for a returning player on Home: a finish on an earlier
 * Hong Kong product day than the server's current one. It is the result card's
 * install nudge (same prompt, same permanent dismissal), docked above the tab
 * bar. It stays hidden while Play is on screen, while the consent tray is
 * docked, and once the server day key goes stale; the nudge hides standalone.
 */
export function HomeInstallOffer(props: {
	locale: Locale
	dayKey: string
	servedAt: number
	resetAt: number
	isGuest?: boolean
}) {
	const [dayCurrent, setDayCurrent] = createSignal(false)
	let eligible = false
	const [consentDocked, setConsentDocked] = createSignal(true)
	const [playVisible, setPlayVisible] = createSignal(true)
	const [mountedOnce, setMountedOnce] = createSignal(false)
	onMount(() => {
		const mountedAt = performance.now()
		const sinceMountMs = () => performance.now() - mountedAt
		const check = () =>
			setDayCurrent(
				isServerDayCurrent({ ...props, sinceMountMs: sinceMountMs(), clientNow: Date.now() }),
			)
		check()
		if (!dayCurrent()) return
		const firstFinishDay = readFirstFinishDay()
		eligible = isInstallOfferEligible({
			firstFinishDay,
			today: props.dayKey,
			pathname: location.pathname,
		})
		if (!eligible) return
		// Close at the reset; a timer delayed by a sleeping tab still fires on wake.
		const timer = setTimeout(
			check,
			Math.min(props.resetAt - props.servedAt, props.resetAt - Date.now()),
		)
		const root = document.documentElement
		const syncConsent = () => setConsentDocked(root.hasAttribute('data-consent-dock'))
		syncConsent()
		const consent = new MutationObserver(syncConsent)
		consent.observe(root, { attributes: true, attributeFilter: ['data-consent-dock'] })
		const stopPlay = observeDayPrimaryActions(setPlayVisible, true)
		onCleanup(() => {
			clearTimeout(timer)
			consent.disconnect()
			stopPlay()
		})
	})
	const visible = () =>
		dayCurrent() &&
		!consentDocked() &&
		shouldShowInstallOffer({
			eligible,
			// The nudge itself follows display-mode and hides in a standalone window.
			standalone: false,
			requested: true,
			primaryActionVisible: playVisible(),
		})
	// Mount the nudge once, on first eligibility, so it reports one prompt; after
	// that, Play or the consent tray coming back only hides it.
	createEffect(() => {
		if (visible()) setMountedOnce(true)
	})
	return (
		<Show when={mountedOnce() && dayCurrent()}>
			<div class="home-install-dock" data-home-install hidden={!visible()}>
				<PwaInstallNudge locale={props.locale} isGuest={props.isGuest} trigger="returning_home" />
			</div>
		</Show>
	)
}
