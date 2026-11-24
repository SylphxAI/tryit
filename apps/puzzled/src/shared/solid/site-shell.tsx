/** @jsxImportSource solid-js */
import { CalendarDays, ChartNoAxesColumn, CircleUserRound, LayoutGrid, Sun } from 'lucide-solid'
import { For, type ParentProps, Show } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import wordmark from '../../../../../brand/wordmark.json'
import { ConsentBanner, CookieSettings } from './consent-banner'
import { LanguageMenu } from './language-menu'
import type { SiteShellData } from './site-shell-data'

const icons = {
	today: Sun,
	games: LayoutGrid,
	archive: CalendarDays,
	stats: ChartNoAxesColumn,
	account: CircleUserRound,
}

export function SiteShell(props: ParentProps<{ data: SiteShellData; signedIn?: boolean }>) {
	return (
		<div class="site-shell flex min-h-dvh flex-col">
			<a
				href="#main-content"
				rel="external"
				class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
			>
				{props.data.skipToMainContent}
			</a>
			<header class="site-header pt-safe sticky top-0 z-header border-b border-hairline bg-background">
				<div class="page-shell-wide flex h-14 items-center gap-2 md:h-16">
					<a
						href={props.data.home}
						class="pressable flex min-h-11 items-center gap-2"
						aria-label="Tryit"
					>
						{/* biome-ignore lint/performance/noImgElement: static SVG with intrinsic size */}
						<img src="/brand/mark.svg" width={32} height={32} alt="" />
						<svg width={56} height={22} viewBox={wordmark.viewBox} aria-hidden="true">
							<path d={wordmark.path} fill="currentColor" />
						</svg>
					</a>
					<nav class="ml-6 hidden items-center gap-1 md:flex" aria-label={props.data.mainNav}>
						<For each={props.data.tabs.slice(0, 4)}>
							{(tab) => (
								<a
									href={tab.href}
									aria-current={tab.active ? 'page' : undefined}
									class="chrome-control px-3.5 text-sm"
									classList={{ 'text-muted-foreground': !tab.active }}
								>
									{tab.title}
								</a>
							)}
						</For>
					</nav>
					<div class="site-header-actions ml-auto flex items-center gap-2">
						<a
							href={props.data.plus.href}
							class="chrome-control gap-1 px-1.5 text-xs sm:gap-2 sm:px-3 sm:text-sm"
						>
							<span class="h-2 w-2 rounded-[2px] bg-accent-warm" aria-hidden="true" />
							{props.data.plus.title}
						</a>
						<div class="site-header-language">
							<LanguageMenu data={props.data} />
						</div>
						<Show
							when={props.signedIn}
							fallback={
								<a
									href={props.data.signIn.href}
									class="chrome-control border border-hairline px-2.5 text-center text-xs sm:px-4 sm:text-sm"
								>
									{props.data.signIn.title}
								</a>
							}
						>
							<a
								href={props.data.tabs[4]?.href}
								class="pressable hidden min-h-11 min-w-11 items-center justify-center rounded-lg md:flex"
								aria-label={props.data.tabs[4]?.title}
							>
								<CircleUserRound size={22} aria-hidden="true" />
							</a>
						</Show>
					</div>
				</div>
			</header>
			{props.children}
			<footer class="site-footer border-t border-hairline">
				<div class="page-shell-wide space-y-4 py-8 text-sm text-muted-foreground">
					<p class="font-display text-xl text-foreground">Tryit</p>
					<p>{props.data.footer.tagline}</p>
					<ul class="flex flex-wrap gap-x-5">
						<For each={props.data.footer.links}>
							{(link) => (
								<li>
									<a
										href={link.href}
										class="inline-flex min-h-11 items-center underline-offset-4 hover:underline"
									>
										{link.title}
									</a>
								</li>
							)}
						</For>
						<li>
							<CookieSettings copy={props.data.consent} />
						</li>
					</ul>
					<p>{props.data.footer.resetNote}</p>
					<small>{props.data.footer.copyright}</small>
				</div>
			</footer>
			<ConsentBanner copy={props.data.consent} />
			<nav
				class="site-tab-bar fixed inset-x-0 bottom-0 border-t border-hairline bg-background pb-safe md:hidden"
				aria-label={props.data.mainNav}
			>
				<div class="mx-auto grid h-bottom-nav-height max-w-lg grid-cols-5">
					<For each={props.data.tabs}>
						{(tab) => (
							<a
								href={tab.href}
								aria-current={tab.active ? 'page' : undefined}
								class="pressable flex min-h-11 flex-col items-center justify-center gap-0.5 text-xs font-medium tracking-tight"
								classList={{ 'text-muted-foreground': !tab.active }}
							>
								<Dynamic
									component={icons[tab.label]}
									size={21}
									stroke-width={tab.active ? 2.3 : 1.7}
									aria-hidden="true"
								/>
								<span>{tab.title}</span>
							</a>
						)}
					</For>
				</div>
			</nav>
		</div>
	)
}
