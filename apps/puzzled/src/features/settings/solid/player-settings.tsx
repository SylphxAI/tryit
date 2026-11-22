/** @jsxImportSource solid-js */
import { ChevronRight, Eye, ShieldCheck } from 'lucide-solid'
import { For, Show } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import { ConsoleCard } from '@/features/console/solid/console-chrome'
import type { Translate } from '@/lib/i18n/translate'
import { localizedPath } from '@/lib/seo/urls'
import { CookieSettings } from '@/shared/solid/consent-banner'
import { consentCopy } from '@/shared/solid/site-shell-data'
import { settingsPath } from './sections'
import { accountPortal, PortalLink, SettingsLink, SettingsTitle } from './settings-controls'
import type { MemberSettingsData } from './settings-data'
import { settingsIcons } from './settings-shell'

type Props = { data: MemberSettingsData; t: Translate }
const groups = [
	{ key: 'player', links: ['profile', 'account'] },
	{ key: 'play', links: ['preferences', 'notifications'] },
	{ key: 'safety', links: ['security', 'privacy'] },
] as const

export function SettingsOverview(props: Props) {
	const t = props.t
	return (
		<>
			<div>
				<span class="chip bg-primary/10 text-primary">
					{t('settings.overview.signedInAs', {
						name: props.data.name || props.data.email || t('settings.playerCard.nameFallback'),
					})}
				</span>
			</div>
			<For each={groups}>
				{({ key, links }) => (
					<ConsoleCard
						title={t(`settings.overview.groups.${key}`)}
						description={t(`settings.overview.groups.${key}Desc`)}
					>
						<ul class="grid gap-2 sm:grid-cols-2">
							<For each={links}>
								{(section) => (
									<li>
										<a
											href={localizedPath(props.data.locale, settingsPath(section))}
											class="pressable flex min-h-11 items-center gap-3 rounded-xl border border-border/70 bg-surface-muted/60 px-3 py-2.5 hover:border-primary/40"
										>
											<Dynamic
												component={settingsIcons[section]}
												class="h-5 w-5 shrink-0 text-primary"
												aria-hidden="true"
											/>
											<span class="min-w-0 flex-1">
												<span class="block text-sm font-semibold">
													{t(`settings.nav.${section}`)}
												</span>
												<span class="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
													{t(`settings.nav.${section}Desc`)}
												</span>
											</span>
											<ChevronRight
												class="h-4 w-4 shrink-0 text-muted-foreground"
												aria-hidden="true"
											/>
										</a>
									</li>
								)}
							</For>
						</ul>
					</ConsoleCard>
				)}
			</For>
		</>
	)
}

export function ProfileSettings(props: Props) {
	const t = props.t
	const link = (path: string) => localizedPath(props.data.locale, path)
	return (
		<>
			<SettingsTitle t={t} section="profile" />
			<ConsoleCard
				title={t('settings.profile.identityTitle')}
				description={t('settings.profile.identityDescription')}
				actions={<PortalLink locale={props.data.locale} label={t('settings.profile.editCta')} />}
			>
				<dl class="space-y-2 text-sm">
					<div class="flex flex-wrap items-baseline gap-x-2">
						<dt class="text-muted-foreground">{t('settings.profile.displayName')}</dt>
						<dd class="font-semibold">
							{props.data.name || t('settings.playerCard.nameFallback')}
						</dd>
					</div>
					<Show when={props.data.email}>
						{(email) => (
							<div class="flex flex-wrap items-baseline gap-x-2">
								<dt class="text-muted-foreground">{t('settings.profile.email')}</dt>
								<dd class="break-all font-semibold">{email()}</dd>
							</div>
						)}
					</Show>
				</dl>
				<p class="mt-3 text-xs leading-relaxed text-muted-foreground">
					{t('settings.profile.identityNote')}
				</p>
			</ConsoleCard>
			<ConsoleCard
				title={t('settings.profile.visibilityTitle')}
				description={t('settings.profile.visibilityDescription')}
			>
				<SettingsLink href={link('/settings/privacy')}>
					{t('settings.profile.visibilityCta')}
				</SettingsLink>
			</ConsoleCard>
			<ConsoleCard
				title={t('settings.profile.boardsTitle')}
				description={t('settings.profile.boardsDescription')}
			>
				<SettingsLink href={link('/leaderboard')}>{t('settings.profile.boardsCta')}</SettingsLink>
			</ConsoleCard>
		</>
	)
}

export function PrivacySettings(props: Props) {
	const t = props.t
	return (
		<>
			<SettingsTitle t={t} section="privacy" />
			<ConsoleCard title={t('consent.title')}>
				<CookieSettings copy={consentCopy(props.data.locale, t)} />
			</ConsoleCard>
			<ConsoleCard
				title={t('settings.privacy.centreTitle')}
				description={t('settings.privacy.centreDescription')}
				actions={
					<PortalLink locale={props.data.locale} primary label={t('settings.privacy.centreCta')} />
				}
			>
				<ul class="space-y-2 text-sm text-muted-foreground">
					<li class="flex items-start gap-2">
						<Eye class="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
						{t('settings.privacy.centreVisibility')}
					</li>
					<li class="flex items-start gap-2">
						<ShieldCheck class="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
						{t('settings.privacy.centreData')}
					</li>
					<li class="flex items-start gap-2">
						<ShieldCheck class="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
						{t('settings.privacy.centreDeletion')}
					</li>
				</ul>
				<Show when={accountPortal.external}>
					<p class="mt-3 text-xs leading-relaxed text-muted-foreground">
						{t('settings.privacy.centreNote')}
					</p>
				</Show>
			</ConsoleCard>
			<ConsoleCard
				title={t('settings.privacy.boardsTitle')}
				description={t('settings.privacy.boardsDescription')}
				actions={
					<SettingsLink href={localizedPath(props.data.locale, '/leaderboard')}>
						{t('settings.privacy.boardsCta')}
					</SettingsLink>
				}
			>
				<p class="text-sm leading-relaxed text-muted-foreground">
					{t('settings.privacy.boardsBody')}
				</p>
			</ConsoleCard>
		</>
	)
}
