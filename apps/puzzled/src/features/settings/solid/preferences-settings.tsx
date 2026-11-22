/** @jsxImportSource solid-js */
import { Globe, Monitor, Moon, Palette, Sun } from 'lucide-solid'
import { createSignal, For, Show } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import { ConsoleCard } from '@/features/console/solid/console-chrome'
import { requestAutoFreeze } from '@/lib/auto-freeze'
import { setAutoFreeze } from '@/lib/connect/gamification-client'
import type { Translate } from '@/lib/i18n/translate'
import { LanguageMenu } from '@/shared/solid/language-menu'
import { themeChoices, useTheme } from '@/shared/solid/theme'
import { SettingsTitle } from './settings-controls'
import type { MemberSettingsData } from './settings-data'

const themeIcons = { system: Monitor, light: Sun, dark: Moon }

function ThemeSelection(props: { t: Translate }) {
	const { choice, choose } = useTheme()
	return (
		<fieldset
			class="flex w-fit max-w-full flex-wrap gap-1 rounded-lg bg-muted p-1"
			aria-label={props.t('common.theme.title')}
		>
			<For each={themeChoices}>
				{(theme) => (
					<button
						type="button"
						disabled={choice() === undefined}
						aria-pressed={choice() === theme}
						aria-label={props.t('common.theme.setTo', { theme: props.t(`common.theme.${theme}`) })}
						class="flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-md px-2 text-sm transition-colors"
						classList={{
							'bg-background text-foreground shadow-sm': choice() === theme,
							'text-muted-foreground hover:text-foreground': choice() !== theme,
						}}
						onClick={() => choose(theme)}
					>
						<Dynamic component={themeIcons[theme]} class="h-4 w-4" aria-hidden="true" />
						{props.t(`common.theme.${theme}`)}
					</button>
				)}
			</For>
		</fieldset>
	)
}

function AutoFreeze(props: { initial: boolean | null; t: Translate }) {
	const [enabled, setEnabled] = createSignal(props.initial)
	const [pending, setPending] = createSignal(false)
	const [failed, setFailed] = createSignal(false)
	async function save() {
		const current = enabled()
		if (pending() || current === null) return
		setPending(true)
		setFailed(false)
		const outcome = await requestAutoFreeze(current, setAutoFreeze)
		setEnabled(outcome.enabled)
		setFailed(outcome.failed)
		setPending(false)
	}
	return (
		<Show
			when={enabled() !== null}
			fallback={
				<p role="alert" class="text-sm text-muted-foreground">
					{props.t('settings.preferences.streakFreeze.unavailable')}
				</p>
			}
		>
			<div class="flex items-center justify-between gap-4">
				<div class="min-w-0">
					<p id="auto-freeze-heading" class="text-sm font-semibold">
						{props.t('settings.streakFreeze.autoFreeze')}
					</p>
					<p id="auto-freeze-description" class="text-xs leading-relaxed text-muted-foreground">
						{props.t('settings.streakFreeze.autoFreezeDesc')}
					</p>
					<p class="mt-1 text-xs text-muted-foreground" aria-live="polite">
						{props.t(
							enabled()
								? 'settings.streakFreeze.autoFreezeEnabled'
								: 'settings.streakFreeze.autoFreezeDisabled',
						)}
					</p>
				</div>
				<button
					type="button"
					role="switch"
					aria-checked={enabled() === true}
					aria-labelledby="auto-freeze-heading"
					aria-describedby="auto-freeze-description"
					disabled={pending()}
					onClick={save}
					class="relative inline-flex min-h-11 min-w-11 shrink-0 items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
				>
					<span
						class="flex h-6 w-11 items-center rounded-full transition-colors"
						classList={{
							'bg-primary': enabled() === true,
							'bg-muted-foreground': enabled() === false,
						}}
					>
						<span
							class="inline-block h-4 w-4 rounded-full transition-transform"
							classList={{
								'translate-x-6 bg-primary-foreground': enabled() === true,
								'translate-x-1 bg-background': enabled() === false,
							}}
						/>
					</span>
				</button>
			</div>
			<Show when={failed()}>
				<p role="alert" class="mt-3 text-sm text-destructive">
					{props.t('settings.preferences.streakFreeze.saveFailed')}
				</p>
			</Show>
		</Show>
	)
}

export function PreferencesSettings(props: { data: MemberSettingsData; t: Translate }) {
	const t = (key: string) => props.t(`settings.${key}`)
	return (
		<>
			<SettingsTitle t={props.t} section="preferences" />
			<ConsoleCard
				title={t('preferences.appearance.title')}
				description={t('preferences.appearance.description')}
			>
				<div class="flex items-start gap-3">
					<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
						<Palette class="h-5 w-5" aria-hidden="true" />
					</span>
					<div class="min-w-0 flex-1">
						<p class="text-sm font-semibold">{t('preferences.appearance.theme')}</p>
						<p class="mb-3 text-xs leading-relaxed text-muted-foreground">
							{t('preferences.appearance.themeDescription')}
						</p>
						<ThemeSelection t={props.t} />
					</div>
				</div>
			</ConsoleCard>
			<ConsoleCard
				title={t('preferences.language.title')}
				description={t('preferences.language.description')}
				className="relative z-10 overflow-visible"
			>
				<div class="flex items-start gap-3">
					<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
						<Globe class="h-5 w-5 text-primary" aria-hidden="true" />
					</span>
					<div class="min-w-0 flex-1">
						<p class="text-sm font-semibold">{t('preferences.language.language')}</p>
						<p class="mb-3 text-xs leading-relaxed text-muted-foreground">
							{t('preferences.language.languageDescription')}
						</p>
						<LanguageMenu data={props.data.shell} showName />
					</div>
				</div>
			</ConsoleCard>
			<ConsoleCard
				title={t('streakFreeze.title')}
				description={t('preferences.streakFreeze.description')}
			>
				<AutoFreeze initial={props.data.autoFreezeEnabled} t={props.t} />
			</ConsoleCard>
		</>
	)
}
