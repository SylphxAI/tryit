/** @jsxImportSource solid-js */
import { BadgeCheck, Check, Copy, LogOut, Trash2 } from 'lucide-solid'
import { createSignal, Show } from 'solid-js'
import { ConsoleCard } from '@/features/console/solid/console-chrome'
import { deleteAccountData } from '@/lib/connect/preferences-client'
import type { Translate } from '@/lib/i18n/translate'
import { localizedPath } from '@/lib/seo/urls'
import { selectCopyText } from '@/shared/hooks/select-copy-text'
import {
	accountPortal,
	PortalLink,
	SettingsButton,
	SettingsTitle,
	signOutDevice,
} from './settings-controls'
import type { MemberSettingsData } from './settings-data'

function AccountId(props: { id: string; t: Translate }) {
	let target!: HTMLElement
	const [result, setResult] = createSignal<{
		id: string
		status: 'pending' | 'copied' | 'failed'
	}>()
	const status = () => (result()?.id === props.id ? result()?.status : undefined)
	async function copy() {
		if (status() === 'pending') return
		const id = props.id
		setResult({ id, status: 'pending' })
		try {
			await navigator.clipboard.writeText(id)
			if (props.id === id) setResult({ id, status: 'copied' })
		} catch {
			if (props.id !== id) return
			setResult({ id, status: 'failed' })
			selectCopyText(target)
		}
	}
	return (
		<div class="mt-4 border-t pt-4">
			<p class="text-xs font-medium text-muted-foreground">
				{props.t('settings.account.accountId')}
			</p>
			<div class="mt-1 flex items-center gap-2">
				<code
					ref={target}
					tabindex={-1}
					data-testid="account-id"
					class="min-w-0 flex-1 select-all break-all text-sm"
				>
					{props.id}
				</code>
				<SettingsButton
					class="shrink-0"
					onClick={copy}
					disabled={status() === 'pending'}
					aria-busy={status() === 'pending'}
				>
					<Show when={status() === 'copied'} fallback={<Copy class="h-4 w-4" aria-hidden="true" />}>
						<Check class="h-4 w-4" aria-hidden="true" />
					</Show>
					<span aria-live="polite">
						{props.t(
							status() === 'pending'
								? 'common.clipboard.pending'
								: status() === 'copied'
									? 'settings.account.accountIdCopied'
									: 'settings.account.copyAccountId',
						)}
					</span>
				</SettingsButton>
			</div>
			<Show when={status() === 'failed'}>
				<p role="alert" class="mt-2 text-sm text-destructive">
					{props.t('common.clipboard.failed')}
				</p>
			</Show>
			<p class="mt-1 text-xs text-muted-foreground">{props.t('settings.account.accountIdHint')}</p>
		</div>
	)
}

export function AccountSettings(props: { data: MemberSettingsData; t: Translate }) {
	const t = props.t
	const [busy, setBusy] = createSignal<'signout' | 'delete' | null>(null)
	const [error, setError] = createSignal<'delete' | 'signout' | null>(null)
	const [erased, setErased] = createSignal(false)
	const displayName = () => props.data.name || t('settings.playerCard.nameFallback')
	let confirmation!: HTMLDialogElement
	let trigger!: HTMLButtonElement

	async function submit(action: 'signout' | 'delete') {
		if (busy() || (action === 'delete' && (!confirmation.open || erased()))) return
		setBusy(action)
		setError(null)
		try {
			if (action === 'delete') {
				confirmation.close()
				await deleteAccountData()
				setErased(true)
			}
			await signOutDevice()
			window.location.assign(localizedPath(props.data.locale, '/'))
		} catch {
			setError(action === 'delete' && !erased() ? 'delete' : 'signout')
			setBusy(null)
			if (action === 'delete' && !erased()) trigger.focus()
		}
	}

	return (
		<>
			<SettingsTitle t={t} section="account" />
			<ConsoleCard
				title={t('settings.account.signedInTitle')}
				description={t('settings.account.signedInDescription')}
			>
				<Show when={props.data.account} keyed>
					{(account) => (
						<>
							<div class="flex items-start gap-4">
								<span
									class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 font-display text-base text-primary"
									aria-hidden="true"
								>
									{displayName()
										.split(/\s+/)
										.slice(0, 2)
										.map((word) => word[0]?.toUpperCase())
										.join('') || '?'}
								</span>
								<div class="min-w-0">
									<p class="font-semibold">{displayName()}</p>
									<Show when={props.data.email}>
										<p class="mt-0.5 break-all text-sm text-muted-foreground">{props.data.email}</p>
									</Show>
									<Show when={account.verified}>
										<span class="chip mt-2 bg-success/10 text-success">
											<BadgeCheck class="h-3.5 w-3.5" aria-hidden="true" />
											{t('settings.playerCard.verified')}
										</span>
									</Show>
								</div>
							</div>
							<AccountId id={account.id} t={t} />
						</>
					)}
				</Show>
			</ConsoleCard>
			<ConsoleCard
				title={t('settings.account.centreTitle')}
				description={t('settings.account.centreDescription')}
				actions={<PortalLink locale={props.data.locale} label={t('settings.account.centreCta')} />}
			>
				<ul class="space-y-1.5 text-sm text-muted-foreground">
					<li>{t('settings.account.centreEmail')}</li>
					<li>{t('settings.account.centrePassword')}</li>
					<li>{t('settings.account.centreDeletion')}</li>
				</ul>
				<Show when={accountPortal.external}>
					<p class="mt-3 text-xs leading-relaxed text-muted-foreground">
						{t('settings.account.centreNote')}
					</p>
				</Show>
			</ConsoleCard>
			<ConsoleCard
				title={t('settings.account.signOutTitle')}
				description={t('settings.account.signOutDescription')}
			>
				<SettingsButton tone="danger" disabled={!!busy()} onClick={() => void submit('signout')}>
					<LogOut class="h-4 w-4" aria-hidden="true" />
					{t(busy() === 'signout' ? 'settings.account.signingOut' : 'settings.account.signOut')}
				</SettingsButton>
				<Show when={error() === 'signout'}>
					<p role="alert" class="mt-3 text-sm text-destructive">
						{t('settings.sessions.revokeError')}
					</p>
				</Show>
			</ConsoleCard>
			<ConsoleCard
				title={t('settings.account.deleteTitle')}
				description={t('settings.account.deleteDescription')}
			>
				<SettingsButton
					ref={trigger}
					tone="danger"
					disabled={!!busy() || erased()}
					onClick={() => confirmation.showModal()}
				>
					<Trash2 class="h-4 w-4" aria-hidden="true" />
					{t(busy() === 'delete' ? 'settings.account.deleting' : 'settings.account.deleteCta')}
				</SettingsButton>
				<Show when={error() === 'delete'}>
					<p role="alert" class="mt-3 text-sm text-destructive">
						{t('settings.account.deleteFailed')}
					</p>
				</Show>
				<dialog
					ref={confirmation}
					aria-labelledby="delete-data-title"
					aria-describedby="delete-data-description"
					class="m-auto max-w-[min(28rem,calc(100%-2rem))] rounded-2xl border border-border bg-card p-5 text-foreground shadow-card backdrop:bg-black/50"
					onClose={() => {
						if (!busy()) trigger.focus()
					}}
				>
					<h2 id="delete-data-title" class="font-display text-xl">
						{t('settings.account.deleteConfirmTitle')}
					</h2>
					<p id="delete-data-description" class="mt-2 text-sm text-muted-foreground">
						{t('settings.account.deleteConfirmDescription')}
					</p>
					<div class="mt-5 flex flex-wrap gap-2">
						<SettingsButton autofocus onClick={() => confirmation.close()}>
							{t('settings.account.deleteCancel')}
						</SettingsButton>
						<SettingsButton tone="danger" onClick={() => void submit('delete')}>
							{t('settings.account.deleteConfirmCta')}
						</SettingsButton>
					</div>
				</dialog>
			</ConsoleCard>
		</>
	)
}
