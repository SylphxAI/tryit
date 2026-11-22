/** @jsxImportSource solid-js */
import { ChevronDown, Languages } from 'lucide-solid'
import { For, Show } from 'solid-js'
import { LOCALE_COOKIE } from '@/lib/i18n/page-locale'
import type { SiteShellData } from './site-shell-data'

export function LanguageMenu(props: { data: SiteShellData; showName?: boolean }) {
	const current = () =>
		props.data.languages.find((language) => language.code === props.data.language)
	return (
		<details class="relative w-fit">
			<summary
				aria-label={props.data.changeLanguage}
				class="pressable flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg px-3 text-sm font-semibold hover:bg-accent"
			>
				<Show when={props.showName} fallback={props.data.language}>
					<Languages class="h-4 w-4" aria-hidden="true" />
					{current()?.name}
					<ChevronDown class="h-4 w-4" aria-hidden="true" />
				</Show>
			</summary>
			<ul
				class={`absolute top-full z-10 min-w-36 rounded-xl border border-border bg-card p-1 shadow-card ${props.showName ? 'left-0' : 'right-0'}`}
			>
				<For each={props.data.languages}>
					{(language) => (
						<li>
							<a
								lang={language.code}
								href={language.href}
								rel="external"
								aria-current={language.code === props.data.language ? 'page' : undefined}
								class="flex min-h-11 items-center rounded-lg px-3 text-sm hover:bg-accent"
								onClick={(event) => {
									if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
									// biome-ignore lint/suspicious/noDocumentCookie: keep the Next locale preference across the migration
									document.cookie = `${LOCALE_COOKIE}=${language.code}; Path=/; Max-Age=31536000; SameSite=Lax`
								}}
							>
								{language.name}
							</a>
						</li>
					)}
				</For>
			</ul>
		</details>
	)
}
