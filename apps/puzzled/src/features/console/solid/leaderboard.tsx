/** @jsxImportSource solid-js */
import { Info, Play, Trophy } from 'lucide-solid'
import { For, Show } from 'solid-js'
import { createTranslator } from '@/lib/i18n/translate'
import { localizedPath } from '@/lib/seo/urls'
import { cn } from '@/lib/utils'
import { ConsoleCard, ConsoleHeader, HonestNotice } from './console-chrome'
import { boardHref, LeaderboardControls } from './leaderboard-controls'
import type { LeaderboardData } from './leaderboard-data'

type BoardEntry = NonNullable<LeaderboardData['entries']>[number]
const PANEL_ID = 'board-panel'

export function Board(props: { data: LeaderboardData }) {
	return (
		<main id="main-content" tabIndex={-1} class="page-shell-wide space-y-6 py-8 md:py-10">
			<Show when={props.data} keyed>
				{(data) => <BoardHeader data={data} />}
			</Show>
			<LeaderboardControls data={props.data} panelId={PANEL_ID} />
			<Show when={props.data} keyed>
				{(data) => (
					<>
						{data.entries ? (
							<BoardEntries data={data} entries={data.entries} />
						) : (
							<UnavailableBoard data={data} />
						)}
						<BoardExplanation locale={data.locale} />
					</>
				)}
			</Show>
		</main>
	)
}

function BoardHeader(props: { data: LeaderboardData }) {
	const t = createTranslator(props.data.locale)
	return (
		<ConsoleHeader
			eyebrow={t('leaderboard.eyebrow')}
			title={t('leaderboard.title')}
			description={t('leaderboard.description')}
			chips={
				<span class="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
					<Trophy class="h-3.5 w-3.5 text-primary" aria-hidden="true" />
					{t('leaderboard.chip', { module: props.data.moduleName })}
				</span>
			}
		/>
	)
}

function UnavailableBoard(props: { data: LeaderboardData }) {
	const { locale, moduleName, moduleSlug, period } = props.data
	const t = createTranslator(locale)
	return (
		<div
			id={PANEL_ID}
			role="tabpanel"
			aria-labelledby={`board-tab-${period}`}
			tabIndex={-1}
			class="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
		>
			<ConsoleCard
				title={t('leaderboard.boardTitle', { module: moduleName })}
				description={t('leaderboard.boardDescription', {
					period: t(`leaderboard.period.${period}`),
				})}
			>
				<HonestNotice
					icon={Trophy}
					title={t('leaderboard.unavailable.title')}
					body={t('leaderboard.unavailable.body')}
					footnote={t('leaderboard.unavailable.footnote')}
					action={{
						href: boardHref(locale, period, moduleSlug),
						label: t('leaderboard.unavailable.retry'),
					}}
				/>
			</ConsoleCard>
		</div>
	)
}

function BoardExplanation(props: { locale: LeaderboardData['locale'] }) {
	const t = createTranslator(props.locale)
	return (
		<ConsoleCard title={t('leaderboard.how.title')} description={t('leaderboard.how.description')}>
			<ul class="space-y-2 text-sm text-muted-foreground">
				<For each={['scores', 'visibility', 'boards']}>
					{(key) => (
						<li class="flex items-start gap-2">
							<Info class="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
							{t(`leaderboard.how.${key}`)}
						</li>
					)}
				</For>
			</ul>
			<a
				href={localizedPath(props.locale, '/settings/privacy')}
				class="mt-3 inline-flex min-h-11 items-center rounded-xl border border-border bg-background px-4 text-sm font-semibold transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
			>
				{t('leaderboard.how.visibilityCta')}
			</a>
		</ConsoleCard>
	)
}

function initials(name: string): string {
	const trimmed = name.trim()
	if (!trimmed) return '?'
	const words = trimmed.split(/\s+/).slice(0, 2)
	return words.map((word) => word[0]?.toUpperCase() ?? '').join('') || '?'
}

/**
 * One board at a time: the module and scope the URL selects.
 *
 * The table is the whole surface — rank, player, score — with the viewer's own
 * row marked in text as well as colour, and an empty state that points at the
 * module instead of repeating itself for every other module.
 */
function BoardEntries(props: { data: LeaderboardData; entries: BoardEntry[] }) {
	const { period, moduleSlug, moduleName, viewerSignedIn, locale } = props.data
	const entries = props.entries
	const translate = createTranslator(locale)
	const t = (key: string, values?: Record<string, number | string>) =>
		translate(`leaderboard.${key}`, values)
	const periodLabel = t(`period.${period}`)
	const viewerInBoard = entries.some((entry) => entry.isViewer)

	return (
		<div
			id={PANEL_ID}
			role="tabpanel"
			aria-labelledby={`board-tab-${period}`}
			tabIndex={-1}
			class="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
		>
			<ConsoleCard
				title={t('boardTitle', { module: moduleName })}
				description={t('boardDescription', { period: periodLabel })}
			>
				{entries.length === 0 ? (
					<div class="py-2">
						<p class="font-semibold">{t('empty.title')}</p>
						<p class="mt-1 text-sm leading-relaxed text-muted-foreground">
							{t('empty.body', { module: moduleName })}
						</p>
						<a
							href={localizedPath(locale, `/games/${moduleSlug}`)}
							class="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
						>
							<Play class="h-4 w-4" aria-hidden="true" />
							{t('empty.play', { module: moduleName })}
						</a>
					</div>
				) : (
					<div class="-mx-4 overflow-x-auto md:-mx-5">
						<table class="w-full min-w-[22rem] border-collapse text-sm">
							<caption class="sr-only">
								{t('tableCaption', { module: moduleName, period: periodLabel })}
							</caption>
							<thead>
								<tr class="text-left text-xs uppercase tracking-wide text-muted-foreground">
									<th scope="col" class="px-4 py-2 font-semibold md:px-5">
										{t('columns.rank')}
									</th>
									<th scope="col" class="px-3 py-2 font-semibold">
										{t('columns.player')}
									</th>
									<th scope="col" class="px-4 py-2 text-right font-semibold md:px-5">
										{t('columns.score')}
									</th>
								</tr>
							</thead>
							<tbody>
								<For each={entries}>
									{(entry) => (
										<tr class={cn('border-t border-border/60', entry.isViewer && 'bg-primary/5')}>
											<th
												scope="row"
												class={cn(
													'px-4 py-3 text-left font-semibold tnum md:px-5',
													entry.rank === 1 && 'text-accent-warm-foreground',
												)}
											>
												<span class="flex items-center gap-1.5">
													{entry.rank === 1 ? <Trophy class="h-4 w-4" aria-hidden="true" /> : null}
													{entry.rank}
												</span>
											</th>
											<td class="px-3 py-3">
												<span class="flex items-center gap-2">
													<span
														class={cn(
															'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold uppercase',
															entry.isViewer
																? 'bg-primary text-primary-foreground'
																: 'bg-muted text-muted-foreground',
														)}
														aria-hidden="true"
													>
														{initials(entry.name)}
													</span>
													<span class="min-w-0 truncate font-medium">{entry.name}</span>
													{entry.isViewer ? (
														<span class="chip bg-primary/10 text-primary">{t('you')}</span>
													) : null}
												</span>
											</td>
											<td class="px-4 py-3 text-right font-semibold tnum md:px-5">
												{entry.score.toLocaleString(locale)}
											</td>
										</tr>
									)}
								</For>
							</tbody>
						</table>
					</div>
				)}

				<p class="mt-4 text-xs leading-relaxed text-muted-foreground">
					{entries.length > 0
						? t('notes.top', { count: entries.length, module: moduleName })
						: t('notes.policy')}
				</p>
				{viewerSignedIn && entries.length > 0 && !viewerInBoard ? (
					<p class="mt-1 text-xs leading-relaxed text-muted-foreground">
						{t('notes.viewerAway', { count: entries.length })}
					</p>
				) : null}
				{!viewerSignedIn ? (
					<p class="mt-1 text-xs leading-relaxed text-muted-foreground">
						{t('notes.guest')}{' '}
						<a
							href={localizedPath(locale, '/sign-in')}
							class="font-semibold text-primary hover:underline"
						>
							{t('notes.signIn')}
						</a>
					</p>
				) : null}
			</ConsoleCard>
		</div>
	)
}
