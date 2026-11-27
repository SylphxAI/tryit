import { createComponent } from 'solid-js'
import { render } from 'solid-js/web'
import { PwaInstallNudge } from '@/features/daily/solid/pwa-install-nudge'
import { captureInstallPrompt } from '@/shared/components/pwa-install-event'
import { HomeInstallOffer } from './home-install-offer'

export { captureInstallPrompt }

export function mountHomeInstallOffer(
	host: HTMLElement,
	day: { dayKey: string; servedAt: number; resetAt: number },
) {
	return render(() => createComponent(HomeInstallOffer, { locale: 'en-US', ...day }), host)
}

/** The result card's placement, for comparing its telemetry with Home's. */
export function mountResultNudge(host: HTMLElement) {
	return render(() => createComponent(PwaInstallNudge, { locale: 'en-US', isGuest: true }), host)
}
