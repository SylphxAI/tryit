/** @jsxImportSource solid-js */
import { ChevronDown, Languages } from 'lucide-solid'
import { For } from 'solid-js'
import { LOCALE_COOKIE } from '@/lib/i18n/page-locale'
import type { SiteShellData } from './site-shell-data'

export function LanguageMenu(props: { data: SiteShellData; showName?: boolean }) {
	return (
		<details
			class="relative w-fit"
			onKeyDown={(event) => {
				if (event.key !== 'Escape' || !event.currentTarget.open) return
				event.preventDefault()
				event.currentTarget.open = false
				event.currentTarget.querySelector('summary')?.focus()
			}}
		>
			<summary
				aria-label={`${props.showName ? props.data.languageName : props.data.languageShortName}, ${props.data.changeLanguage}`}
				class="chrome-control cursor-pointer list-none gap-1 px-1.5 text-xs sm:px-3 sm:text-sm"
			>
				<Languages
					class="language-icon h-4 w-4 shrink-0"
					classList={{ hidden: !props.showName }}
					aria-hidden="true"
				/>
				<span class="language-name" lang={props.data.language}>
					{props.showName ? props.data.languageName : props.data.languageShortName}
				</span>
				<ChevronDown class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
			</summary>
			<ul
				data-language-options=""
				class={`absolute top-full z-10 editorial-surface min-w-36 rounded-2xl p-1 ${props.showName ? 'left-0' : 'right-0'}`}
			>
				<For each={props.data.languages}>
					{(language) => (
						<li>
							<a
								lang={language.code}
								href={language.href}
								rel="external"
								aria-current={language.code === props.data.language ? 'page' : undefined}
								class="chrome-control flex justify-start px-3 text-sm"
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
