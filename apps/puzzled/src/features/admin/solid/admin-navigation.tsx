/** @jsxImportSource solid-js */
import { A } from '@solidjs/router'
import { createSignal, For, onCleanup, onMount } from 'solid-js'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator, type Translate } from '@/lib/i18n/translate'
import { localizedPath } from '@/lib/seo/urls'
import { useTheme } from '@/shared/solid/theme'
import { AdminDialog, control } from './admin-controls'
import { type AdminSection, adminPath, adminSections } from './admin-routes'

export function AdminNavigation(props: { section: AdminSection; locale: Locale; t: Translate }) {
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
