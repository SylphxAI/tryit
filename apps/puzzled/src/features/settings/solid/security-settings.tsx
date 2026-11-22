/** @jsxImportSource solid-js */
import { LogOut, RefreshCw, ShieldCheck } from 'lucide-solid'
import { createResource, createSignal, For, Match, Show, Switch } from 'solid-js'
import { isServer } from 'solid-js/web'
import { ConsoleCard, HonestNotice } from '@/features/console/solid/console-chrome'
import type { Locale } from '@/lib/i18n/config'
import type { Translate } from '@/lib/i18n/translate'
import { type AccountSession, isAccountSession } from '@/lib/identity/sessions'
import { localizedPath } from '@/lib/seo/urls'
import { PortalLink, SettingsButton, SettingsTitle, signOutDevice } from './settings-controls'

type Page = { sessions: AccountSession[]; currentSessionId: string; nextCursor: string }
async function readSessions(cursor: string): Promise<Page | null> {
	try {
		const response = await fetch(`/api/identity/sessions?${new URLSearchParams({ cursor })}`, {
			credentials: 'same-origin',
			cache: 'no-store',
		})
		if (!response.ok) return null
		const page: Partial<Page> = await response.json()
		if (
			!Array.isArray(page?.sessions) ||
			!page.sessions.every(isAccountSession) ||
			typeof page.currentSessionId !== 'string' ||
			!page.currentSessionId ||
			typeof page.nextCursor !== 'string'
		)
			return null
		return page as Page
	} catch {
		return null
	}
}

export function SecuritySettings(props: { locale: Locale; t: Translate }) {
	const t = props.t
	const [cursor, setCursor] = createSignal('')
	const [busy, setBusy] = createSignal<
		{ operation: 'signout' } | { operation: 'revoke'; id: string }
	>()
	const [failed, setFailed] = createSignal(false)
	const [sessions, { refetch }] = createResource(
		() => (isServer ? false : { cursor: cursor() }),
		({ cursor }) => readSessions(cursor),
	)

	async function submit(operation: 'signout' | 'revoke', id?: string) {
		if (busy() || (operation === 'revoke' && (!id || sessions.loading))) return
		setBusy(operation === 'revoke' && id ? { operation, id } : { operation: 'signout' })
		setFailed(false)
		try {
			if (operation === 'signout') {
				await signOutDevice()
			} else {
				const response = await fetch('/api/identity/sessions', {
					method: 'POST',
					credentials: 'same-origin',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ sessionId: id }),
				})
				if (!response.ok) throw new Error('revoke_failed')
				const data = await response.json()
				if (data?.endedCurrent === false) {
					await refetch()
					setBusy(undefined)
					return
				}
				if (data?.endedCurrent !== true) throw new Error('unconfirmed_revoke')
			}
			window.location.assign(localizedPath(props.locale, '/'))
		} catch {
			setFailed(true)
			setBusy(undefined)
		}
	}

	const dateTime = new Intl.DateTimeFormat(props.locale, {
		dateStyle: 'medium',
		timeStyle: 'short',
	})
	function started(seconds: number) {
		const date = new Date(seconds * 1000)
		return Number.isFinite(date.getTime()) ? dateTime.format(date) : '—'
	}
	function ending(id: string) {
		const command = busy()
		return command?.operation === 'revoke' && command.id === id
	}

	return (
		<>
			<SettingsTitle t={t} section="security" />
			<ConsoleCard
				title={t('settings.security.protectionTitle')}
				description={t('settings.security.protectionDescription')}
				actions={<PortalLink locale={props.locale} label={t('settings.security.protectionCta')} />}
			>
				<ul class="space-y-2 text-sm text-muted-foreground">
					<For each={['protectionPassword', 'protectionTwoFactor', 'protectionRecovery']}>
						{(key) => (
							<li class="flex items-start gap-2">
								<ShieldCheck class="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
								{t(`settings.security.${key}`)}
							</li>
						)}
					</For>
				</ul>
			</ConsoleCard>
			<ConsoleCard
				title={t('settings.sessions.title')}
				description={t('settings.security.sessionsDescription')}
			>
				<div aria-live="polite" aria-busy={sessions.loading || sessions.latest === undefined}>
					<Switch>
						<Match when={sessions.loading || sessions.latest === undefined}>
							<p class="text-sm text-muted-foreground">{t('settings.security.sessionsLoading')}</p>
						</Match>
						<Match when={sessions.latest} keyed>
							{(page) => (
								<div class="space-y-3">
									<Show
										when={page.sessions.length > 0}
										fallback={<p>{t('settings.sessions.noSessions')}</p>}
									>
										<ul class="divide-y divide-border">
											<For each={page.sessions}>
												{(session) => (
													<li class="flex flex-wrap items-center justify-between gap-3 py-3">
														<div class="min-w-0 break-words">
															<p class="font-medium">
																{session.session_id === page.currentSessionId
																	? t('settings.sessions.currentSession')
																	: session.device.display_name ||
																		session.device.user_agent ||
																		t('settings.sessions.unknownDevice')}
															</p>
															<p class="text-sm text-muted-foreground">
																{t('settings.sessions.started', {
																	time: started(session.created_at_unix_seconds),
																})}
															</p>
															<p class="text-sm text-muted-foreground">
																{t(
																	`settings.sessions.state.${['active', 'revoked', 'expired'].includes(session.state) ? session.state : 'unknown'}`,
																)}
															</p>
														</div>
														<Show when={session.state === 'active'}>
															<SettingsButton
																disabled={!!busy()}
																onClick={() => void submit('revoke', session.session_id)}
															>
																{t(
																	ending(session.session_id)
																		? 'settings.account.signingOut'
																		: 'settings.sessions.signOut',
																)}
															</SettingsButton>
														</Show>
													</li>
												)}
											</For>
										</ul>
									</Show>
									<div class="flex flex-wrap gap-2">
										<Show when={cursor()}>
											<SettingsButton disabled={!!busy()} onClick={() => setCursor('')}>
												{t('settings.sessions.firstPage')}
											</SettingsButton>
										</Show>
										<Show when={page.nextCursor}>
											<SettingsButton
												disabled={!!busy()}
												onClick={() => setCursor(page.nextCursor)}
											>
												{t('settings.sessions.nextPage')}
											</SettingsButton>
										</Show>
									</div>
								</div>
							)}
						</Match>
						<Match when={sessions.latest === null}>
							<HonestNotice
								title={t('settings.security.sessionsUnavailableTitle')}
								body={t('settings.security.sessionsUnavailableBody')}
							/>
						</Match>
					</Switch>
				</div>
				<Show when={failed()}>
					<p role="alert" class="mt-3 text-sm text-destructive">
						{t('settings.sessions.revokeError')}
					</p>
				</Show>
				<div class="mt-4 flex flex-wrap gap-2">
					<SettingsButton onClick={() => void refetch()} disabled={!!busy() || sessions.loading}>
						<RefreshCw
							class="h-4 w-4"
							classList={{ 'animate-spin': sessions.loading }}
							aria-hidden="true"
						/>
						{t('settings.sessions.retry')}
					</SettingsButton>
					<SettingsButton tone="danger" disabled={!!busy()} onClick={() => void submit('signout')}>
						<LogOut class="h-4 w-4" aria-hidden="true" />
						{t(
							busy()?.operation === 'signout'
								? 'settings.account.signingOut'
								: 'settings.account.signOut',
						)}
					</SettingsButton>
				</div>
			</ConsoleCard>
		</>
	)
}
