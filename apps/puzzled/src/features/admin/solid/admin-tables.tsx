/** @jsxImportSource solid-js */
import { A } from '@solidjs/router'
import { For, type JSX, Show } from 'solid-js'
import type { Translate } from '@/lib/i18n/translate'
import { control } from './admin-controls'
import { adminPageSize } from './admin-routes'

export function Table(props: { title: string; headers: string[]; children: JSX.Element }) {
	return (
		// biome-ignore lint/a11y/noNoninteractiveTabindex: wide operator tables must scroll by keyboard.
		<section class="admin-card overflow-x-auto" tabIndex={0} aria-label={props.title}>
			<table class="admin-table text-left text-sm">
				<thead>
					<tr>
						<For each={props.headers}>{(text) => <th scope="col">{text}</th>}</For>
					</tr>
				</thead>
				<tbody>{props.children}</tbody>
			</table>
		</section>
	)
}

export function Counts(props: { cells: Array<[string, string | number | null]> }) {
	return (
		<dl class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
			<For each={props.cells}>
				{([name, value]) => (
					<div class="admin-stat-card flex min-w-0 flex-col-reverse gap-1 p-4">
						<dt class="admin-stat-label break-words">{name}</dt>
						<dd class="text-xl font-bold tabular-nums">{value ?? '—'}</dd>
					</div>
				)}
			</For>
		</dl>
	)
}

export function Pages(props: {
	page: number
	total: number
	action?: string
	path: string
	t: Translate
}) {
	const last = () => Math.max(1, Math.ceil(props.total / adminPageSize))
	const to = (page: number) =>
		props.path +
		'?' +
		new URLSearchParams({ ...(props.action ? { action: props.action } : {}), page: String(page) })
	const t = (key: string) => props.t(`admin.auditLogs.pagination.${key}`)
	return (
		<nav aria-label="Pagination" class="flex flex-wrap items-center gap-3">
			<Show when={props.page > 1}>
				<A href={to(props.page - 1)} class={control}>
					{t('previous')}
				</A>
			</Show>
			<span class="text-sm">
				{props.t('admin.auditLogs.pagination.page', { page: props.page, total: last() })}
			</span>
			<Show when={props.page < last()}>
				<A href={to(props.page + 1)} class={control}>
					{t('next')}
				</A>
			</Show>
		</nav>
	)
}
