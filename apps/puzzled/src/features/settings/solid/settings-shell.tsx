/** @jsxImportSource solid-js */
import {
	Bell,
	CreditCard,
	LayoutDashboard,
	Palette,
	Shield,
	ShieldCheck,
	User,
	UserCircle,
} from 'lucide-solid'
import { createMemo, For, type ParentProps, Show } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import { ConsoleHeader } from '@/features/console/solid/console-chrome'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { localizedPath } from '@/lib/seo/urls'
import { type SettingsSection, settingsPath, settingsSections } from './sections'

export const settingsIcons = {
	overview: LayoutDashboard,
	profile: UserCircle,
	account: User,
	subscription: CreditCard,
	preferences: Palette,
	notifications: Bell,
	security: ShieldCheck,
	privacy: Shield,
} as const

export function SettingsShell(
	props: ParentProps<{ locale: Locale; section: SettingsSection; member: boolean }>,
) {
	const t = createMemo(() => createTranslator(props.locale))
	return (
		<main id="main-content" tabIndex={-1} class="page-shell-wide py-8 md:py-10">
			<Show when={props.member} fallback={props.children}>
				<ConsoleHeader
					eyebrow={t()('settings.eyebrow')}
					title={t()('settings.title')}
					description={t()('settings.subtitle')}
				/>
				<div class="mt-6 flex flex-col gap-6 md:flex-row md:gap-8">
					<div class="min-w-0 md:w-56 md:shrink-0">
						<nav
							aria-label={t()('settings.nav.sections')}
							class="md:sticky md:top-24 md:self-start md:rounded-2xl md:border md:border-border/70 md:bg-surface-muted/50 md:p-2"
						>
							<ul class="flex gap-1 overflow-x-auto md:flex-col md:gap-0.5 md:overflow-visible">
								<For each={settingsSections}>
									{(section) => (
										<li class="shrink-0 md:shrink">
											<a
												href={localizedPath(props.locale, settingsPath(section))}
												aria-current={props.section === section ? 'page' : undefined}
												class="pressable flex min-h-11 items-center gap-2.5 whitespace-nowrap rounded-xl px-3 text-sm font-medium"
												classList={{
													'bg-primary/10 text-primary': props.section === section,
													'text-muted-foreground hover:bg-muted': props.section !== section,
												}}
											>
												<Dynamic
													component={settingsIcons[section]}
													class="h-4 w-4 shrink-0"
													aria-hidden="true"
												/>
												{t()(
													section === 'subscription'
														? 'plus.subscription.title'
														: `settings.nav.${section}`,
												)}
											</a>
										</li>
									)}
								</For>
							</ul>
						</nav>
					</div>
					<div class="min-w-0 flex-1 space-y-6">{props.children}</div>
				</div>
			</Show>
		</main>
	)
}
