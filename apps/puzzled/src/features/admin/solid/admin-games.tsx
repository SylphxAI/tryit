/** @jsxImportSource solid-js */
import { A } from '@solidjs/router'
import { For, Show } from 'solid-js'
import { getGameSlugs } from '@/games/registry'
import type { Locale } from '@/lib/i18n/config'
import type { Translate } from '@/lib/i18n/translate'
import { control } from './admin-controls'
import type { AdminDocumentData } from './admin-data'
import { Table } from './admin-tables'

export function renderGames(
	data: Extract<AdminDocumentData, { kind: 'games' }>,
	t: Translate,
	section: (key: string) => string,
	name: (slug: string) => string,
	link: (target: 'games', slug?: string) => string,
) {
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
}

export function renderGame(
	data: Extract<AdminDocumentData, { kind: 'game' }>,
	name: (slug: string) => string,
	link: (target: 'games', slug?: string) => string,
	props: { locale: Locale },
) {
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
				<Table title={name(data.slug)} headers={['Date', 'Plays', 'Wins', 'Average attempts']}>
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
}
