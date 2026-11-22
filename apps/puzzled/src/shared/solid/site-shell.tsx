/** @jsxImportSource solid-js */
import { CalendarDays, ChartNoAxesColumn, CircleUserRound, LayoutGrid, Sun } from 'lucide-solid'
import { For, type ParentProps } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import wordmark from '../../../../../brand/wordmark.json'
import { ConsentBanner } from './consent-banner'
import { LanguageMenu } from './language-menu'
import type { SiteShellData } from './site-shell-data'

const icons = {
	today: Sun,
	games: LayoutGrid,
	archive: CalendarDays,
	stats: ChartNoAxesColumn,
	account: CircleUserRound,
}

export function SiteShell(props: ParentProps<{ data: SiteShellData }>) {
	return (
		<div class="flex min-h-dvh flex-col pb-[calc(58px+env(safe-area-inset-bottom))] md:pb-0">
			<a
				href="#main-content"
				rel="external"
				class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
			>
				Skip to main content
			</a>
			<header class="pt-safe sticky top-0 z-header border-b border-hairline bg-background">
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
									class="pressable flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold"
									classList={{ 'bg-accent': tab.active, 'text-muted-foreground': !tab.active }}
								>
									{tab.title}
								</a>
							)}
						</For>
					</nav>
					<div class="ml-auto flex items-center gap-2">
						<a
							href={props.data.plus.href}
							class="pressable flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold"
						>
							<span class="h-2 w-2 rounded-[2px] bg-accent-warm" aria-hidden="true" />
							{props.data.plus.title}
						</a>
						<LanguageMenu data={props.data} />
						<a
							href={props.data.tabs[4]?.href}
							class="pressable hidden min-h-11 min-w-11 items-center justify-center rounded-lg md:flex"
							aria-label={props.data.tabs[4]?.title}
						>
							<CircleUserRound size={22} aria-hidden="true" />
						</a>
					</div>
				</div>
			</header>
			{props.children}
			<footer class="border-t border-hairline">
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
					</ul>
					<p>{props.data.footer.resetNote}</p>
					<small>{props.data.footer.copyright}</small>
				</div>
			</footer>
			<ConsentBanner
				privacyHref={props.data.privacy.href}
				privacyLabel={props.data.privacy.title}
			/>
			<nav
				class="fixed inset-x-0 bottom-0 z-bottom-nav border-t border-hairline bg-background pb-safe md:hidden"
				aria-label={props.data.mainNav}
			>
				<div class="mx-auto grid h-[58px] max-w-lg grid-cols-5">
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
									size={24}
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
