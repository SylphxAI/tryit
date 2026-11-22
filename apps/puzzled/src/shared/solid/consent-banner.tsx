/** @jsxImportSource solid-js */
import { onMount } from 'solid-js'
import { CONSENT_KEY, CONSENT_TIMESTAMP_KEY, MARKETING_CONSENT_KEY } from '@/lib/storage-keys'

/** The decision is first-party, optional, and never required for play or checkout. */
export function ConsentBanner(props: { privacyHref: string; privacyLabel: string }) {
	onMount(() => {
		try {
			const status = localStorage.getItem(CONSENT_KEY)
			if (status === 'accepted' || status === 'declined') {
				document.documentElement.dataset.consentDecided = ''
			}
		} catch {
			/* Leave optional storage off when storage is unavailable. */
		}
	})
	function choose(status: 'accepted' | 'declined') {
		const timestamp = new Date().toISOString()
		try {
			localStorage.setItem(MARKETING_CONSENT_KEY, status)
			localStorage.setItem(CONSENT_TIMESTAMP_KEY, timestamp)
			localStorage.setItem(CONSENT_KEY, status)
		} catch {
			/* Do not tell analytics consent was granted if it could not be stored. */
			document.documentElement.dataset.consentDecided = ''
			return
		}
		document.documentElement.dataset.consentDecided = ''
		window.dispatchEvent(new CustomEvent('consent-change', { detail: { status, timestamp } }))
	}
	return (
		<div class="consent-bar border-t border-hairline bg-background" data-consent-banner>
			<section
				aria-label="Optional cookies"
				class="page-shell-wide flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-sm"
			>
				<p class="text-muted-foreground">
					Allow optional analytics and advertising cookies?{' '}
					<a class="underline" href={props.privacyHref}>
						{props.privacyLabel}
					</a>
				</p>
				<div class="flex gap-3">
					<button
						type="button"
						class="min-h-11 rounded-lg border border-hairline px-4 font-semibold"
						onClick={() => choose('declined')}
					>
						Decline
					</button>
					<button
						type="button"
						class="min-h-11 rounded-lg bg-primary px-4 font-semibold text-primary-foreground"
						onClick={() => choose('accepted')}
					>
						Accept
					</button>
				</div>
			</section>
		</div>
	)
}
