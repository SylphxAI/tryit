/** @jsxImportSource solid-js */
import { A } from '@solidjs/router'
import { For, Show } from 'solid-js'
import { slugToCamelCase } from '@/lib/game-slug'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { localizedPath } from '@/lib/seo/urls'
import { Announcements } from './admin-announcements'
import { AuditEntries, renderAuditLogs } from './admin-audit'
import { control, type RunAdminCommand } from './admin-controls'
import type { AdminDocumentData } from './admin-data'
import { renderDlq } from './admin-dlq'
import { renderGame, renderGames } from './admin-games'
import { Metrics } from './admin-metrics'
import { AdminNavigation } from './admin-navigation'
import { type AdminSection, adminPath } from './admin-routes'
import { Counts } from './admin-tables'
import '../admin.css'

export { AdminAccess } from './admin-navigation'

type Document = Exclude<AdminDocumentData, { kind: 'guest' | 'denied' | 'missing' }>

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
				return renderAuditLogs(data, t, section, time, link)
			case 'dlq':
				return renderDlq(data, t, section, time, link, props)
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
				return renderGames(data, t, section, name, link)
			case 'game':
				return renderGame(data, name, link, props)
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
			<Show when={props.section !== 'analytics' || props.data.kind === 'analytics'}>
				<AdminNavigation
					locale={props.locale}
					t={t}
					section={props.section}
					analyticsOnly={props.data.kind === 'analytics' && props.data.analyticsOnly}
				/>
			</Show>
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
