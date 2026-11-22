/** @jsxImportSource solid-js */
import { BadgeCheck, BarChart3, Flame, Trophy, UserCircle } from 'lucide-solid'
import { For } from 'solid-js'
import { createTranslator } from '@/lib/i18n/translate'
import { localizedPath } from '@/lib/seo/urls'
import { cn } from '@/lib/utils'
import { ConsoleCard, ConsoleHeader } from './console-chrome'
import type { readProfile } from './profile-data'

function initials(value: string): string {
	const words = value.trim().split(/\s+/).slice(0, 2)
	return words.map((word) => word[0]?.toUpperCase() ?? '').join('') || '?'
}

export function ProfileCard(props: { data: NonNullable<Awaited<ReturnType<typeof readProfile>>> }) {
	const user = props.data
	const { locale, finished, won, streak } = user
	const translate = createTranslator(locale)
	const t = (key: string, values?: Record<string, string>) => translate(`settings.${key}`, values)
	const displayName = user.name?.trim() || t('playerCard.nameFallback')
	const memberSince =
		user.createdAt && !Number.isNaN(Date.parse(user.createdAt))
			? new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date(user.createdAt))
			: null

	const links = [
		{ href: '/stats', icon: BarChart3, label: t('playerCard.recordLink') },
		{ href: '/leaderboard', icon: Trophy, label: t('playerCard.boardLink') },
		{ href: '/settings/account', icon: UserCircle, label: t('playerCard.settingsLink') },
		{ href: '/settings/privacy', icon: BadgeCheck, label: t('playerCard.privacyLink') },
	]

	return (
		<main id="main-content" tabIndex={-1} class="page-shell-wide py-8 md:py-10">
			<div class="space-y-6">
				<ConsoleHeader
					eyebrow={t('playerCard.eyebrow')}
					title={t('playerCard.pageTitle')}
					description={t('playerCard.pageDescription')}
					chips={
						user.emailVerified ? (
							<span class="chip bg-success/10 text-success">{t('playerCard.verified')}</span>
						) : null
					}
				/>

				<div class="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
					<ConsoleCard
						title={t('playerCard.identityTitle')}
						description={t('playerCard.identityDescription')}
					>
						<div class="flex items-start gap-4">
							<span
								class="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-muted via-muted to-fuchsia-500 font-display text-xl text-white"
								aria-hidden="true"
							>
								{initials(displayName)}
							</span>
							<div class="min-w-0">
								<p class="font-display text-lg">{displayName}</p>
								{user.email ? (
									<p class="mt-0.5 truncate text-sm text-muted-foreground">{user.email}</p>
								) : null}
								{memberSince ? (
									<p class="mt-2 text-xs text-muted-foreground">
										{t('playerCard.memberSince', { date: memberSince })}
									</p>
								) : null}
							</div>
						</div>
					</ConsoleCard>

					<ConsoleCard
						title={t('playerCard.progressTitle')}
						description={t('playerCard.progressDescription')}
					>
						<dl class="grid grid-cols-3 gap-3 text-center">
							<div class="rounded-2xl border border-border/70 bg-surface-muted/60 p-3">
								<dt class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
									{t('playerCard.stats.gamesPlayed')}
								</dt>
								<dd
									class={cn(
										'mt-1 font-display text-2xl tnum',
										finished === null && 'text-muted-foreground',
									)}
								>
									{finished === null ? t('playerCard.notLoaded') : finished}
								</dd>
							</div>
							<div class="rounded-2xl border border-border/70 bg-surface-muted/60 p-3">
								<dt class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
									{t('playerCard.stats.winRate')}
								</dt>
								<dd class="mt-1 font-display text-2xl tnum">
									{won === null || finished === null
										? t('playerCard.notLoaded')
										: finished > 0
											? `${Math.round((won / finished) * 100)}%`
											: t('playerCard.noFinishes')}
								</dd>
							</div>
							<div class="rounded-2xl border border-border/70 bg-surface-muted/60 p-3">
								<dt class="flex items-center justify-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
									<Flame class="h-3.5 w-3.5 text-stat-streak" aria-hidden="true" />
									{t('playerCard.stats.streak')}
								</dt>
								<dd class="mt-1 font-display text-2xl tnum">
									{streak === null ? t('playerCard.notLoaded') : streak}
								</dd>
							</div>
						</dl>
						{finished === null || streak === null ? (
							<p class="mt-3 text-xs leading-relaxed text-muted-foreground">
								{t('playerCard.progressNote')}
							</p>
						) : null}
					</ConsoleCard>
				</div>

				<ConsoleCard
					title={t('playerCard.linksTitle')}
					description={t('playerCard.linksDescription')}
				>
					<ul class="grid gap-2 sm:grid-cols-2">
						<For each={links}>
							{({ href, icon: Icon, label }) => (
								<li>
									<a
										href={localizedPath(locale, href)}
										class="flex min-h-11 items-center gap-2.5 rounded-xl border border-border/70 bg-surface-muted/60 px-3 text-sm font-medium transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
									>
										<Icon class="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
										{label}
									</a>
								</li>
							)}
						</For>
					</ul>
				</ConsoleCard>
			</div>
		</main>
	)
}
