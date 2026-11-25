/** @jsxImportSource solid-js */
import { A } from '@solidjs/router'
import { For, Show } from 'solid-js'
import type { AuditLogEntry } from '@/gen/connect/puzzled/v1/admin_pb'
import type { Translate } from '@/lib/i18n/translate'
import { AdminDialog, control } from './admin-controls'
import type { AdminDocumentData } from './admin-data'
import { adminPageSize, auditActions } from './admin-routes'
import { Counts, Pages, Table } from './admin-tables'

export function AuditEntries(props: {
	entries: AuditLogEntry[]
	t: Translate
	time: (value: string) => string
	details?: boolean
}) {
	const t = (key: string) => props.t(`admin.auditLogs.${key}`)
	return (
		<Show
			when={props.entries.length}
			fallback={
				<p class="admin-card p-5">
					{t('empty.title')} — {t('empty.description')}
				</p>
			}
		>
			<Table
				title={t('title')}
				headers={['timestamp', 'action', 'actor', 'resource', 'ip'].map((key) => t(`table.${key}`))}
			>
				<For each={props.entries}>
					{(entry) => (
						<tr>
							<td class="whitespace-nowrap">{props.time(entry.createdAt)}</td>
							<td>
								{props.t.has(`admin.auditLogs.actions.${entry.action}`)
									? t(`actions.${entry.action}`)
									: entry.action}
							</td>
							<td class="break-all">{entry.actorId || entry.userId || '—'}</td>
							<td class="break-all">
								{[entry.entityType, entry.entityId].filter(Boolean).join(' · ') || '—'}
							</td>
							<td>{entry.ipAddress || '—'}</td>
							<Show when={props.details}>
								<td>
									<AdminDialog
										title={t('details.title')}
										trigger={t('details.title')}
										close={props.t('admin.commandPalette.close')}
									>
										{() => (
											<dl class="space-y-3">
												<For
													each={[
														[t('details.user'), entry.userId],
														[t('details.actor'), entry.actorId],
														[t('details.resourceType'), entry.entityType],
														[t('details.resourceId'), entry.entityId],
														[t('details.ipAddress'), entry.ipAddress],
														[t('details.userAgent'), entry.userAgent],
														[t('details.timestamp'), props.time(entry.createdAt)],
														[t('details.metadata'), entry.metadataJson],
													]}
												>
													{([label, value]) => (
														<div>
															<dt class="text-sm font-semibold">{label}</dt>
															<dd class="whitespace-pre-wrap break-all text-sm">{value || '—'}</dd>
														</div>
													)}
												</For>
											</dl>
										)}
									</AdminDialog>
								</td>
							</Show>
						</tr>
					)}
				</For>
			</Table>
		</Show>
	)
}

export function renderAuditLogs(
	data: Extract<AdminDocumentData, { kind: 'auditLogs' }>,
	t: Translate,
	section: (key: string) => string,
	time: (value: string) => string,
	link: (target: 'auditLogs') => string,
) {
	return (
		<>
			<Counts
				cells={[
					[section('stats.totalLogs'), data.total],
					[section('stats.onThisPage'), data.entries.length],
					[section('stats.totalPages'), Math.max(1, Math.ceil(data.total / adminPageSize))],
					[section('stats.adminActions'), data.entries.filter((entry) => entry.actorId).length],
				]}
			/>
			<form method="get" action={link('auditLogs')} class="flex flex-wrap items-end gap-2">
				<label class="grid gap-1 text-sm font-semibold">
					{section('filters.action')}
					<select name="action" class="admin-input min-h-11" value={data.options.action}>
						<option value="">{section('filters.allActions')}</option>
						<For each={auditActions}>
							{(action) => <option value={action}>{section(`actions.${action}`)}</option>}
						</For>
					</select>
				</label>
				<button class={control} type="submit">
					Apply filter
				</button>
				<A class={control} href={link('auditLogs')}>
					{section('filters.clearFilters')}
				</A>
			</form>
			<AuditEntries entries={data.entries} t={t} time={time} details />
			<Pages path={link('auditLogs')} {...data.options} total={data.total} t={t} />
		</>
	)
}
