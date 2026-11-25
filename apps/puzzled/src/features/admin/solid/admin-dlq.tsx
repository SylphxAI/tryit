/** @jsxImportSource solid-js */
import { For, Show } from 'solid-js'
import type { DlqEntry } from '@/gen/connect/puzzled/v1/admin_pb'
import type { Translate } from '@/lib/i18n/translate'
import { AdminDialog, ConfirmPanel, type RunAdminCommand } from './admin-controls'
import type { AdminDocumentData } from './admin-data'
import { Counts, Pages, Table } from './admin-tables'

export function renderDlq(
	data: Extract<AdminDocumentData, { kind: 'dlq' }>,
	t: Translate,
	section: (key: string) => string,
	time: (value: string) => string,
	link: (target: 'dlq') => string,
	props: { run: RunAdminCommand },
) {
	return (
		<>
			<Counts
				cells={(['total', 'pending', 'retrying', 'resolved', 'failed'] as const).map((key) => [
					section(`stats.${key}`),
					data[key],
				])}
			/>
			<Show when={Object.keys(data.byWorkflow).length}>
				<dl class="admin-card flex flex-wrap gap-4 p-4">
					<For each={Object.entries(data.byWorkflow)}>
						{([workflow, count]) => (
							<div class="flex gap-2">
								<dt>{workflow}</dt>
								<dd class="font-semibold">{count}</dd>
							</div>
						)}
					</For>
				</dl>
			</Show>
			<Show
				when={data.entries.length}
				fallback={
					<p class="admin-card p-5">
						{section('empty.title')} — {section('empty.description')}
					</p>
				}
			>
				<Table
					title={section('title')}
					headers={['workflow', 'error', 'retries', 'status', 'created', 'actions'].map((key) =>
						section(`table.${key}`),
					)}
				>
					<For each={data.entries}>
						{(row) => (
							<tr>
								<td>{row.jobType}</td>
								<td class="min-w-32 break-words">{row.error}</td>
								<td>{row.attempts}/3</td>
								<td>
									{t.has(`admin.dlq.status.${row.status}`)
										? section(`status.${row.status}`)
										: row.status}
								</td>
								<td class="whitespace-nowrap">{time(row.createdAt)}</td>
								<td>
									<DlqControls row={row} t={t} run={props.run} />
								</td>
							</tr>
						)}
					</For>
				</Table>
			</Show>
			<Pages path={link('dlq')} page={data.options.page} total={data.total} t={t} />
		</>
	)
}

function DlqControls(props: { row: DlqEntry; t: Translate; run: RunAdminCommand }) {
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
