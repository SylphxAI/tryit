/** @jsxImportSource solid-js */
import { createSignal, For, type JSX, Show } from 'solid-js'
import type { Announcement, DlqEntry } from '@/gen/connect/puzzled/v1/admin_pb'
import type { Translate } from '@/lib/i18n/translate'
import type { AdminMutationResult } from './admin-mutation'
import { type AdminCommand, type AnnouncementType, announcementTypes } from './admin-routes'

export type RunAdminCommand = (input: AdminCommand) => Promise<AdminMutationResult>
const announcementLabel = {
	info: 'Info',
	warning: 'Warning',
	success: 'Success',
	maintenance: 'Maintenance',
}
function toLocal(instant?: string) {
	const date = new Date(instant ?? '')
	return Number.isFinite(date.getTime())
		? new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
		: ''
}
function toInstant(input: FormDataEntryValue | null) {
	return typeof input === 'string' && input ? new Date(input).toISOString() : ''
}
export function AdminDialog(props: {
	title: string
	trigger: string
	close: string
	children: (close: () => void) => JSX.Element
}) {
	let dialog!: HTMLDialogElement
	const [open, setOpen] = createSignal(false)
	return (
		<>
			<button
				type="button"
				class="admin-btn admin-btn-secondary min-h-11"
				onClick={() => {
					setOpen(true)
					dialog.showModal()
				}}
			>
				{props.trigger}
			</button>
			<dialog
				ref={dialog}
				aria-label={props.title}
				class="admin-card fixed inset-0 m-auto max-h-[90dvh] w-[min(36rem,calc(100%-2rem))] max-w-none overflow-auto p-5 text-[var(--admin-text-primary)] backdrop:bg-black/50"
				onClose={() => setOpen(false)}
			>
				<div class="mb-4 flex items-center justify-between gap-4">
					<h2 class="text-lg font-semibold">{props.title}</h2>
					<button
						type="button"
						class="admin-btn admin-btn-ghost min-h-11"
						onClick={() => dialog.close()}
					>
						{props.close}
					</button>
				</div>
				<Show when={open()}>{props.children(() => dialog.close())}</Show>
			</dialog>
		</>
	)
}

function errorText(result: Exclude<AdminMutationResult, 'saved'>) {
	if (result === 'denied') return 'Access was denied. Sign in with an administrator account.'
	if (result === 'invalid') return 'Check the supplied values before submitting again.'
	return 'The change could not be confirmed. Refresh and check the current state before trying again.'
}

function useCommand(run: RunAdminCommand, close: () => void) {
	const [pending, setPending] = createSignal(false)
	const [error, setError] = createSignal('')
	return {
		pending,
		error,
		async submit(input: AdminCommand) {
			if (pending()) return
			setPending(true)
			setError('')
			try {
				const result = await run(input)
				if (result === 'saved') close()
				else setError(errorText(result))
			} catch {
				setError(errorText('unconfirmed'))
			} finally {
				setPending(false)
			}
		},
	}
}

function AnnouncementFields(props: {
	row?: Announcement
	t: Translate
	run: RunAdminCommand
	close: () => void
}) {
	const command = useCommand(props.run, props.close)
	const t = (key: string) => props.t(`admin.announcements.${key}`)
	return (
		<form
			class="space-y-4"
			onSubmit={(event) => {
				event.preventDefault()
				const form = new FormData(event.currentTarget)
				void command.submit({
					kind: 'announcement-save',
					id: props.row?.id ?? '',
					title: String(form.get('title') ?? ''),
					body: String(form.get('body') ?? ''),
					type: form.get('type') as AnnouncementType,
					active: form.has('active'),
					dismissible: form.has('dismissible'),
					startsAt: toInstant(form.get('startsAt')),
					endsAt: toInstant(form.get('endsAt')),
				})
			}}
		>
			<fieldset disabled={command.pending()} class="space-y-4">
				<label class="block text-sm font-semibold">
					{t('title')}
					<input
						class="admin-input mt-1 w-full"
						name="title"
						required
						maxLength={255}
						value={props.row?.title ?? ''}
					/>
				</label>
				<label class="block text-sm font-semibold">
					{t('content')}
					<textarea
						class="admin-input mt-1 w-full"
						rows={5}
						name="body"
						required
						maxLength={10000}
						value={props.row?.body ?? ''}
					/>
				</label>
				<label class="block text-sm font-semibold">
					{t('type')}
					<select class="admin-input mt-1 w-full" name="type" value={props.row?.type ?? 'info'}>
						<For each={announcementTypes}>
							{(type) => <option value={type}>{t(`type${announcementLabel[type]}`)}</option>}
						</For>
					</select>
				</label>
				<div class="flex flex-wrap gap-4">
					<label class="flex min-h-11 items-center gap-2">
						<input name="active" type="checkbox" checked={props.row?.active ?? true} />
						{t('active')}
					</label>
					<label class="flex min-h-11 items-center gap-2">
						<input name="dismissible" type="checkbox" checked={props.row?.dismissible ?? true} />
						{t('dismissible')}
					</label>
				</div>
				<div class="grid gap-3 sm:grid-cols-2">
					<label class="block min-w-0 text-sm font-semibold">
						{t('startsAt')}
						<input
							class="admin-input mt-1 w-full"
							name="startsAt"
							type="datetime-local"
							value={toLocal(props.row?.startsAt)}
						/>
					</label>
					<label class="block min-w-0 text-sm font-semibold">
						{t('endsAt')}
						<input
							class="admin-input mt-1 w-full"
							name="endsAt"
							type="datetime-local"
							value={toLocal(props.row?.endsAt)}
						/>
					</label>
				</div>
				<p class="text-sm text-[var(--admin-text-secondary)]">
					Times use your device’s time zone. Leave a time blank to remove that limit.
				</p>
				<button type="submit" class="admin-btn admin-btn-primary min-h-11">
					{t('save')}
				</button>
			</fieldset>
			<Show when={command.error()}>
				<p role="alert" class="text-[var(--admin-error)]">
					{command.error()}
				</p>
			</Show>
		</form>
	)
}

function ConfirmPanel(props: {
	description: string
	label: string
	input: AdminCommand
	run: RunAdminCommand
	close: () => void
	destructive?: boolean
}) {
	const command = useCommand(props.run, props.close)
	return (
		<div class="space-y-4">
			<p>{props.description}</p>
			<button
				type="button"
				class={`admin-btn min-h-11 ${props.destructive ? 'admin-btn-danger' : 'admin-btn-primary'}`}
				disabled={command.pending()}
				onClick={() => void command.submit(props.input)}
			>
				{props.label}
			</button>
			<Show when={command.error()}>
				<p role="alert" class="text-[var(--admin-error)]">
					{command.error()}
				</p>
			</Show>
		</div>
	)
}

export function Announcements(props: {
	rows: Announcement[]
	t: Translate
	run: RunAdminCommand
	time: (value: string) => string
}) {
	const t = (key: string) => props.t(`admin.announcements.${key}`)
	const close = () => t('cancel')
	return (
		<div class="space-y-4">
			<AdminDialog trigger={t('create')} title={t('createTitle')} close={close()}>
				{(cancel) => <AnnouncementFields t={props.t} run={props.run} close={cancel} />}
			</AdminDialog>
			<Show
				when={props.rows.length}
				fallback={
					<section class="admin-card p-6">
						<h2 class="font-semibold">{t('noAnnouncementsYet')}</h2>
						<p>{t('noAnnouncementsHint')}</p>
					</section>
				}
			>
				<ul class="space-y-3">
					<For each={props.rows}>
						{(row) => (
							<li class="admin-card space-y-3 p-4 sm:p-5">
								<div class="flex flex-wrap items-center justify-between gap-3">
									<h2 class="min-w-0 break-words text-lg font-semibold">{row.title}</h2>
									<span class="admin-badge admin-badge-info">
										{t(row.active ? 'active' : 'inactive')}
									</span>
								</div>
								<p class="whitespace-pre-wrap break-words">{row.body}</p>
								<p class="break-words text-sm text-[var(--admin-text-secondary)]">
									{announcementTypes.find((type) => type === row.type)
										? t(`type${announcementLabel[row.type as AnnouncementType]}`)
										: row.type}{' '}
									· {row.dismissible ? t('dismissible') : 'Not dismissible'}
									<Show when={row.startsAt}>
										{' '}
										· {t('startsAt')}: {props.time(row.startsAt)}
									</Show>
									<Show when={row.endsAt}>
										{' '}
										· {t('endsAt')}: {props.time(row.endsAt)}
									</Show>
								</p>
								<div class="flex flex-wrap gap-2">
									<AdminDialog trigger={t('editTitle')} title={t('editTitle')} close={close()}>
										{(cancel) => (
											<AnnouncementFields row={row} t={props.t} run={props.run} close={cancel} />
										)}
									</AdminDialog>
									<AdminDialog trigger={t('delete')} title={t('confirmDelete')} close={close()}>
										{(cancel) => (
											<ConfirmPanel
												destructive
												description={t('deleteConfirm')}
												label={t('delete')}
												input={{ kind: 'announcement-delete', id: row.id }}
												run={props.run}
												close={cancel}
											/>
										)}
									</AdminDialog>
								</div>
							</li>
						)}
					</For>
				</ul>
			</Show>
		</div>
	)
}

export function DlqControls(props: { row: DlqEntry; t: Translate; run: RunAdminCommand }) {
	const t = (key: string) => props.t(`admin.dlq.${key}`)
	const label = (key: string) => t(`actions.${key}`)
	const close = () => props.t('admin.announcements.cancel')
	const working = () => props.row.status === 'pending' || props.row.status === 'retrying'
	return (
		<div class="flex min-w-40 flex-wrap gap-2">
			<AdminDialog trigger={label('viewDetails')} title={props.row.jobType} close={close()}>
				{() => (
					<>
						<p class="break-words">{props.row.error}</p>
						<Show when={props.row.nextRetryAt}>
							<p>Next retry: {props.row.nextRetryAt}</p>
						</Show>
						<pre class="mt-3 overflow-auto whitespace-pre-wrap break-all text-xs">
							{props.row.payloadJson}
						</pre>
					</>
				)}
			</AdminDialog>
			<Show when={props.row.status === 'pending' || props.row.status === 'failed'}>
				<AdminDialog
					trigger={props.row.attempts >= 3 ? t('forceRetry') : label('retry')}
					title={t('confirmRetryTitle')}
					close={close()}
				>
					{(cancel) => (
						<ConfirmPanel
							description={t('confirmRetryDescription')}
							label={label('retry')}
							input={{ kind: 'dlq-retry', id: props.row.id }}
							run={props.run}
							close={cancel}
						/>
					)}
				</AdminDialog>
			</Show>
			<Show when={working()}>
				<For each={['resolve', 'fail'] as const}>
					{(operation) => (
						<AdminDialog trigger={label(operation)} title={label(operation)} close={close()}>
							{(cancel) => (
								<ConfirmPanel
									description={props.row.jobType}
									label={label(operation)}
									input={{
										kind: operation === 'resolve' ? 'dlq-resolve' : 'dlq-fail',
										id: props.row.id,
									}}
									run={props.run}
									close={cancel}
								/>
							)}
						</AdminDialog>
					)}
				</For>
			</Show>
		</div>
	)
}
