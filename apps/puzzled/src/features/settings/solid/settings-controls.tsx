/** @jsxImportSource solid-js */
import { ExternalLink } from 'lucide-solid'
import { type ComponentProps, Show, splitProps } from 'solid-js'
import { ConsoleHeader } from '@/features/console/solid/console-chrome'
import type { Locale } from '@/lib/i18n/config'
import type { Translate } from '@/lib/i18n/translate'
import { accountPortalAnchor, accountPortalLink } from '@/lib/identity/account-portal'
import { localizedPath } from '@/lib/seo/urls'

const BUTTON =
	'pressable inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50'
const tones = {
	outline: 'border-border bg-background hover:border-primary/40 hover:text-primary',
	primary: 'border-cta-edge bg-cta text-cta-foreground hover:bg-cta-hover',
	danger: 'border-destructive bg-destructive text-destructive-foreground',
}

export function SettingsButton(props: ComponentProps<'button'> & { tone?: keyof typeof tones }) {
	const [local, attrs] = splitProps(props, ['tone', 'class'])
	return (
		<button
			type="button"
			{...attrs}
			class={`${BUTTON} ${tones[local.tone ?? 'outline']} ${local.class ?? ''}`}
		/>
	)
}

export function SettingsLink(props: ComponentProps<'a'> & { tone?: keyof typeof tones }) {
	const [local, attrs] = splitProps(props, ['tone', 'class'])
	return <a {...attrs} class={`${BUTTON} ${tones[local.tone ?? 'outline']} ${local.class ?? ''}`} />
}

export function SettingsTitle(props: { t: Translate; section: string }) {
	return (
		<ConsoleHeader
			headingLevel={2}
			title={props.t(`settings.${props.section}.title`)}
			description={props.t(`settings.${props.section}.description`)}
		/>
	)
}

export const accountPortal = accountPortalLink()

export function PortalLink(props: { locale: Locale; label: string; primary?: boolean }) {
	return (
		<SettingsLink
			tone={props.primary ? 'primary' : 'outline'}
			{...accountPortalAnchor(accountPortal)}
			href={
				accountPortal.external
					? accountPortal.href
					: localizedPath(props.locale, accountPortal.href)
			}
		>
			{props.label}
			<Show when={accountPortal.external}>
				<ExternalLink class="h-4 w-4" aria-hidden="true" />
			</Show>
		</SettingsLink>
	)
}

export async function signOutDevice() {
	const response = await fetch('/api/identity/logout', {
		method: 'POST',
		credentials: 'same-origin',
	})
	if (!response.ok) throw new Error('sign_out_failed')
}
