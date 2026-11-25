/** @jsxImportSource solid-js */
import { For, Show } from 'solid-js'
import type { Announcement } from '@/gen/connect/puzzled/v1/admin_pb'
import type { Translate } from '@/lib/i18n/translate'
import { AdminDialog, ConfirmPanel, type RunAdminCommand, useCommand } from './admin-controls'
import { type AnnouncementType, announcementTypes } from './admin-routes'

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
