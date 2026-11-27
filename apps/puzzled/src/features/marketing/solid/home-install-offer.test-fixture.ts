import { createComponent } from 'solid-js'
import { render } from 'solid-js/web'
import { captureInstallPrompt } from '@/shared/components/pwa-install-event'
import { HomeInstallOffer } from './home-install-offer'

export { captureInstallPrompt }

export function mountHomeInstallOffer(
	host: HTMLElement,
	day: { dayKey: string; servedAt: number; resetAt: number },
) {
	return render(() => createComponent(HomeInstallOffer, { locale: 'en-US', ...day }), host)
}
