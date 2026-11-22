/** @jsxImportSource solid-js */
import { A } from '@solidjs/router'
import { createSignal, For, type JSX, onCleanup, onMount, Show } from 'solid-js'
import { getGameSlugs } from '@/games/registry'
import type { AuditLogEntry, GetMetricsReportResponse } from '@/gen/connect/puzzled/v1/admin_pb'
import { slugToCamelCase } from '@/lib/game-slug'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator, type Translate } from '@/lib/i18n/translate'
import { localizedPath } from '@/lib/seo/urls'
import { useTheme } from '@/shared/solid/theme'
import { AdminDialog, Announcements, DlqControls, type RunAdminCommand } from './admin-controls'
import type { AdminDocumentData } from './admin-data'
import {
	type AdminSection,
	adminPageSize,
	adminPath,
	adminSections,
	auditActions,
} from './admin-routes'
import '../admin.css'

type Document = Exclude<AdminDocumentData, { kind: 'guest' | 'denied' | 'missing' }>
const control = 'admin-btn admin-btn-secondary min-h-11'

function AdminNavigation(props: { section: AdminSection; locale: Locale; t: Translate }) {
	const theme = useTheme()
	const [search, setSearch] = createSignal('')
	const sections = () =>
		adminSections.filter((section) =>
			props
				.t(`admin.sidebar.${section}`)
				.toLocaleLowerCase(props.locale)
				.includes(search().toLocaleLowerCase(props.locale)),
		)
	let openCommand!: HTMLDivElement
	onMount(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return
			event.preventDefault()
			const dialog = openCommand.querySelector('dialog')
			if (dialog?.open) dialog.close()
			else openCommand.querySelector('button')?.click()
		}
		document.addEventListener('keydown', onKey)
		onCleanup(() => document.removeEventListener('keydown', onKey))
	})
	return (
		<header class="border-b border-[var(--admin-border)] bg-[var(--admin-bg-elevated)]">
			<div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-8">
				<A href={localizedPath(props.locale, '/admin')} class="font-display text-lg font-bold">
					{props.t('admin.sidebar.console')}
				</A>
				<div class="flex flex-wrap gap-2">
					<A href={localizedPath(props.locale)} class={control}>
						{props.t('admin.sidebar.backToApp')}
					</A>
					<button
						type="button"
						class={control}
						onClick={() =>
							theme.choose(
								theme.choice() === 'system'
									? 'light'
									: theme.choice() === 'light'
										? 'dark'
										: 'system',
							)
						}
					>
						Theme: {theme.choice()}
					</button>
					<div ref={openCommand}>
						<AdminDialog
							title={props.t('admin.commandPalette.title')}
							trigger={props.t('admin.commandPalette.open')}
							close={props.t('admin.commandPalette.close')}
						>
							{(close) => (
								<>
									<label class="block text-sm font-semibold">
										{props.t('admin.commandPalette.search')}
										<input
											class="admin-input mt-1 w-full"
											ref={(input) => queueMicrotask(() => input.focus())}
											value={search()}
											onInput={(event) => setSearch(event.currentTarget.value)}
										/>
									</label>
									<ul class="mt-3 space-y-1">
										<For
											each={sections()}
											fallback={<li>{props.t('admin.commandPalette.noResults')}</li>}
										>
											{(section) => (
												<li>
													<A
														class="block rounded px-2 py-2 hover:bg-[var(--admin-bg-hover)]"
														href={localizedPath(props.locale, adminPath(section))}
														onClick={() => {
															close()
															setSearch('')
														}}
													>
														{props.t(`admin.sidebar.${section}`)}
													</A>
												</li>
											)}
										</For>
									</ul>
								</>
							)}
						</AdminDialog>
					</div>
				</div>
			</div>
			<nav
				aria-label={props.t('admin.sidebar.navigation')}
				class="mx-auto flex max-w-6xl flex-wrap gap-1 px-4 pb-3 sm:px-8"
			>
				<For each={adminSections}>
					{(section) => (
						<A
							end
							href={localizedPath(props.locale, adminPath(section))}
							aria-current={props.section === section ? 'page' : undefined}
							class="admin-btn admin-btn-ghost min-h-11"
							classList={{ 'bg-[var(--admin-accent-subtle)]': props.section === section }}
						>
							{props.t(`admin.sidebar.${section}`)}
						</A>
					)}
				</For>
			</nav>
		</header>
	)
}

function Table(props: { title: string; headers: string[]; children: JSX.Element }) {
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

function Counts(props: { cells: Array<[string, string | number | null]> }) {
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

function Pages(props: {
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

function AuditEntries(props: {
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

function Metrics(props: { report: GetMetricsReportResponse; locale: Locale }) {
	const percent = new Intl.NumberFormat(props.locale, {
		style: 'percent',
		maximumFractionDigits: 1,
	})
	const rate = (n: number, d: number) =>
		d ? `${percent.format(n / d)} (${n}/${d})` : '— (no cohort)'
	return (
		<section class="space-y-3" aria-label="Daily puzzle completers">
			<h2 class="text-lg font-semibold">Daily puzzle completers</h2>
			<p>Asia/Hong_Kong product days · refreshed every 15 minutes · current day provisional</p>
			<Show when={props.report.stale}>
				<p role="alert" class="admin-card p-4">
					Scheduled metrics are missing or more than 30 minutes old. Check the product-metrics
					schedule.
				</p>
			</Show>
			<p class="text-sm">
				D7 means completing again on day 7. New completers are consenting first-time completers
				after a verified share landing in the preceding seven product days. Plus and free rates
				cover signed-in viewers only; trials are not paid.
			</p>
			<Table
				title="Last 35 product days"
				headers={[
					'Product day',
					'Completers (signed in)',
					'D7 retention',
					'Weekly regulars',
					'Shares / landings / new completers',
					'Free finish errors',
					'Plus / free completion',
					'Alerts',
				]}
			>
				<For each={props.report.days}>
					{(day) => (
						<tr>
							<th scope="row" class="whitespace-nowrap">
								{day.dayKey}
								{day.complete ? '' : ' (provisional)'}
								<span class="block font-normal">Updated {day.generatedAt}</span>
							</th>
							<td>
								{day.dailyPuzzleCompleters} ({day.signedInCompleters})
							</td>
							<td>{day.complete ? rate(day.d7Returned, day.d7Cohort) : 'Not mature'}</td>
							<td>{day.weeklyRitualists}</td>
							<td>
								{day.shares} / {day.shareLandings} / {day.shareLandingCompleters}
							</td>
							<td>{rate(day.freeFinishFailed, day.freeFinishOk + day.freeFinishFailed)}</td>
							<td>
								{rate(day.paidCompleters, day.paidActive)} /{' '}
								{rate(day.freeCompleters, day.freeActive)}
							</td>
							<td>
								{day.complete ? day.alerts.join(', ') || 'None above threshold' : 'Not evaluated'}
							</td>
						</tr>
					)}
				</For>
			</Table>
		</section>
	)
}

export function AdminAccess(props: { locale: Locale; missing?: boolean }) {
	return (
		<main class="admin-theme grid min-h-screen place-items-center p-4">
			<section class="admin-card w-full max-w-md space-y-4 p-6 text-center">
				<h1 class="admin-page-title">
					{props.missing ? 'Page not found' : 'Admin Access Required'}
				</h1>
				<p>
					{props.missing
						? 'This game is not in the catalogue.'
						: 'Your account could not be verified as a Tryit administrator.'}
				</p>
				<A class={control} href={localizedPath(props.locale)}>
					{createTranslator(props.locale)('admin.sidebar.backToApp')}
				</A>
			</section>
		</main>
	)
}

export function AdminView(props: {
	locale: Locale
	section: AdminSection
	data: Document
	refresh: () => void
	run: RunAdminCommand
}) {
	const t = createTranslator(props.locale)
	const section = (key: string) => t(`admin.${props.section}.${key}`)
	const time = (value: string) => {
		const date = new Date(value)
		return Number.isFinite(date.getTime())
			? `${new Intl.DateTimeFormat(props.locale, {
					dateStyle: 'medium',
					timeStyle: 'short',
					timeZone: 'UTC',
				}).format(date)} UTC`
			: value || '—'
	}
	const link = (target: AdminSection, slug?: string) =>
		localizedPath(props.locale, adminPath(target, slug))
	const name = (slug: string) =>
		t.has(`games.${slugToCamelCase(slug)}.name`) ? t(`games.${slugToCamelCase(slug)}.name`) : slug
	const unavailable = () => (
		<p role="alert" class="admin-card p-5">
			This data is unavailable. Refresh to check again.
		</p>
	)
	function contents() {
		const data = props.data
		switch (data.kind) {
			case 'unavailable':
				return unavailable()
			case 'dashboard':
				return (
					<>
						<Counts
							cells={[
								[section('gameSessions'), data.sessions],
								[t('admin.dlq.stats.pending'), data.pending],
								[t('admin.dlq.stats.failed'), data.failed],
								[
									section('database'),
									data.databaseOk === null ? null : data.databaseOk ? 'Operational' : 'Unavailable',
								],
							]}
						/>
						<section class="space-y-3">
							<h2 class="text-lg font-semibold">{section('quickActions')}</h2>
							<div class="flex flex-wrap gap-2">
								<For each={['dlq', 'games', 'auditLogs', 'settings'] as const}>
									{(key) => (
										<A class={control} href={link(key)}>
											{t(`admin.sidebar.${key}`)}
										</A>
									)}
								</For>
							</div>
						</section>
						<section class="space-y-3">
							<h2 class="text-lg font-semibold">{section('recentActivity')}</h2>
							{data.activity ? (
								<AuditEntries entries={data.activity} t={t} time={time} />
							) : (
								unavailable()
							)}
						</section>
					</>
				)
			case 'analytics':
				return <Metrics report={data.report} locale={props.locale} />
			case 'announcements':
				return <Announcements rows={data.rows} t={t} run={props.run} time={time} />
			case 'auditLogs':
				return (
					<>
						<Counts
							cells={[
								[section('stats.totalLogs'), data.total],
								[section('stats.onThisPage'), data.entries.length],
								[section('stats.totalPages'), Math.max(1, Math.ceil(data.total / adminPageSize))],
								[
									section('stats.adminActions'),
									data.entries.filter((entry) => entry.actorId).length,
								],
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
			case 'dlq':
				return (
					<>
						<Counts
							cells={(['total', 'pending', 'retrying', 'resolved', 'failed'] as const).map(
								(key) => [section(`stats.${key}`), data[key]],
							)}
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
								headers={['workflow', 'error', 'retries', 'status', 'created', 'actions'].map(
									(key) => section(`table.${key}`),
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
			case 'experiments':
				return (
					<section class="admin-card space-y-2 p-6">
						<h2 class="text-lg font-semibold">{section('emptyState.title')}</h2>
						<p>{section('emptyState.description')}</p>
					</section>
				)
			case 'settings':
				return (
					<section class="admin-card space-y-3 p-6">
						<h2 class="text-lg font-semibold">App Settings</h2>
						<p>
							Manage player-facing announcements here. Use the platform console for account,
							billing, and authentication settings.
						</p>
						<div class="flex flex-wrap gap-2">
							<A class={control} href={link('announcements')}>
								{t('admin.sidebar.announcements')}
							</A>
							<A class={control} href={link('dlq')}>
								{t('admin.sidebar.dlq')}
							</A>
						</div>
					</section>
				)
			case 'games':
				return (
					<>
						<p>{section('codeDefinedDescription')}</p>
						<Table
							title={section('title')}
							headers={[t('admin.analytics.game'), 'Today: plays / wins', 'All time: plays / wins']}
						>
							<For each={getGameSlugs()}>
								{(slug) => {
									const row = data.rows.find((entry) => entry.slug === slug)
									return (
										<tr>
											<th scope="row">
												<A href={link('games', slug)} class="underline underline-offset-2">
													{row?.name || name(slug)}
												</A>
											</th>
											<td>
												{row?.todayPlayed ?? 0} / {row?.todayWins ?? 0}
											</td>
											<td>
												{row?.allTimePlayed ?? 0} / {row?.allTimeWins ?? 0}
											</td>
										</tr>
									)
								}}
							</For>
						</Table>
					</>
				)
			case 'game':
				return (
					<>
						<div class="flex flex-wrap gap-2">
							<A href={link('games')} class={control}>
								Back to Games
							</A>
							<For each={[7, 14, 30, 90]}>
								{(days) => (
									<A
										href={`${link('games', data.slug)}?days=${days}`}
										aria-current={data.days === days ? 'page' : undefined}
										class={control}
									>
										{days} days
									</A>
								)}
							</For>
						</div>
						<Show
							when={data.rows.length}
							fallback={<p class="admin-card p-5">No completed sessions in this period.</p>}
						>
							<Table
								title={name(data.slug)}
								headers={['Date', 'Plays', 'Wins', 'Average attempts']}
							>
								<For each={data.rows}>
									{(row) => (
										<tr>
											<th scope="row">{row.date}</th>
											<td>{row.gamesPlayed}</td>
											<td>{row.wins}</td>
											<td>
												{new Intl.NumberFormat(props.locale, { maximumFractionDigits: 1 }).format(
													row.avgAttempts,
												)}
											</td>
										</tr>
									)}
								</For>
							</Table>
						</Show>
					</>
				)
			case 'system':
				return (
					<section class="admin-card space-y-3 p-6">
						<h2 class="text-lg font-semibold">
							{section(data.health.databaseOk ? 'status.healthy' : 'status.unhealthy')}
						</h2>
						<dl class="space-y-2">
							<div>
								<dt class="font-semibold">{t('admin.dashboard.database')}</dt>
								<dd>
									{data.health.databaseOk
										? 'Operational'
										: data.health.databaseError || 'Unavailable'}
								</dd>
							</div>
							<div>
								<dt class="font-semibold">Uptime</dt>
								<dd>{data.health.uptime || '—'}</dd>
							</div>
						</dl>
					</section>
				)
		}
	}
	return (
		<div class="admin-theme">
			<AdminNavigation locale={props.locale} t={t} section={props.section} />
			<main class="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-8 sm:py-8">
				<header class="flex flex-wrap items-start justify-between gap-3">
					<div>
						<h1 class="admin-page-title">
							{props.data.kind === 'game'
								? name(props.data.slug)
								: props.section === 'announcements'
									? t('admin.sidebar.announcements')
									: section('title')}
						</h1>
						<p class="admin-page-subtitle">{section('subtitle')}</p>
					</div>
					<button class={control} type="button" onClick={props.refresh}>
						{t('admin.dlq.refresh')}
					</button>
				</header>
				{contents()}
			</main>
		</div>
	)
}
