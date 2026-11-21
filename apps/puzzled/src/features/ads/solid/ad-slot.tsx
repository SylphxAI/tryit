/** @jsxImportSource solid-js */
import { createSignal, onCleanup, onMount, Show } from 'solid-js'
import { canStoreMarketing, onConsentChange } from '@/features/analytics/lib/consent'
import { type AdsConfig, adScriptSrc } from '@/lib/ads'

export function AdSlot(props: { config: AdsConfig; label: string }) {
	const [consented, setConsented] = createSignal(false)
	onMount(() => {
		const update = () => setConsented(canStoreMarketing())
		update()
		onCleanup(onConsentChange(update))
	})
	return (
		<Show when={consented()}>
			<aside aria-label={props.label} class="w-full text-center">
				<p class="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">{props.label}</p>
				<ins
					ref={() => queueMicrotask(() => consented() && loadAd(props.config.clientId))}
					class="adsbygoogle block min-h-[90px] w-full"
					data-ad-client={props.config.clientId}
					data-ad-slot={props.config.slotId}
					data-ad-format="auto"
					data-full-width-responsive="true"
				/>
			</aside>
		</Show>
	)
}

function loadAd(clientId: string) {
	const src = adScriptSrc(clientId)
	if (!document.querySelector(`script[src="${src}"]`)) {
		const script = document.createElement('script')
		script.async = true
		script.crossOrigin = 'anonymous'
		script.src = src
		document.head.appendChild(script)
	}
	try {
		window.adsbygoogle ??= []
		window.adsbygoogle.push({})
	} catch {
		// Advertising failures never block the archive.
	}
}
