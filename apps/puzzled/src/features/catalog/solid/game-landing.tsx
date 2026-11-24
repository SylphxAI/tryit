/** @jsxImportSource solid-js */
import { ChevronDown, Clock, Lightbulb, Play } from 'lucide-solid'
import { For, type ParentProps, Show } from 'solid-js'
import { getRequestEvent, isServer, NoHydration } from 'solid-js/web'
import { markStartIntent, START_INTENT_ATTRIBUTE } from '@/features/daily/lib/start-intent'
import { getGameColors } from '@/games/theme-colors'
import { localizedPath } from '@/lib/seo/urls'
import { START_INTENT_KEY } from '@/lib/storage-keys'
import { JsonLd } from '@/shared/solid/json-ld'
import { PageMeta } from '@/shared/solid/page-meta'
import { SiteShell } from '@/shared/solid/site-shell'
import { CatalogTile } from './catalog-page'
import type { GamePageData } from './game-data'

export const playButton =
	'pressable inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border-[1.5px] border-[#1a1712] bg-cta px-7 text-base font-bold text-cta-foreground shadow-[0_3px_0_0_#1a1712] transition-colors hover:bg-cta-hover active:translate-y-0.5 active:shadow-[0_1px_0_0_#1a1712]'

// Capture an explicit Play tap even before Solid installs its click handler.
// Do not turn a shared or pasted URL into permission to spend a daily pick.
const captureEarlyPlay = `document.addEventListener('click',function(e){
  if(e.defaultPrevented||e.button!==0||e.shiftKey||e.ctrlKey||e.metaKey||e.altKey)return;
  const link=e.target.closest?.('a[${START_INTENT_ATTRIBUTE}]');
  if(!link)return;
  try{sessionStorage.setItem('${START_INTENT_KEY}',JSON.stringify({slug:link.getAttribute('${START_INTENT_ATTRIBUTE}'),at:Date.now()}))}catch{}
},true)`

export function GameLanding(
	props: ParentProps<{
		data: GamePageData
		stage: boolean
		playHref: string
		daily: boolean
		isGuest: boolean
	}>,
) {
	const nonce = isServer ? getRequestEvent()?.locals.cspNonce : undefined
	const d = () => props.data
	const t = () => d().labels
	const color = () => getGameColors(d().theme).bg
	const title = () => (
		<h1
			class={
				props.stage
					? 'font-display text-2xl leading-tight md:text-[1.75rem]'
					: 'font-display text-[2.5rem] leading-[1.02] text-balance md:text-6xl'
			}
		>
			{d().name}
		</h1>
	)
	const motif = () => (
		// biome-ignore lint/performance/noImgElement: decorative static SVG
		<img
			src={`/motifs/${d().slug}.svg`}
			alt=""
			width="160"
			height="100"
			class="h-full w-full object-contain"
		/>
	)
	const facts = () => (
		<ul class="flex flex-wrap items-center gap-1.5 text-xs font-medium">
			<li class="tag-chip numeral">
				<Clock class="h-3 w-3" aria-hidden="true" />
				{d().duration}
			</li>
			<li class="tag-chip">{d().category}</li>
			<Show when={d().highlight}>
				<li class="tag-chip">{d().highlight}</li>
			</Show>
			<Show when={d().difficultyLevels.length}>
				<li class="tag-chip">
					{d()
						.difficultyLevels.map(({ label }) => label)
						.join(' / ')}
				</li>
			</Show>
		</ul>
	)
	const featured = () => (
		<Show when={d().featured}>
			<span class="inline-flex rounded-full bg-foreground px-2.5 py-1 text-xs font-semibold text-background">
				{t().featured}
			</span>
		</Show>
	)

	return (
		<SiteShell data={d().shell}>
			<PageMeta value={d().meta} />
			<main id="main-content" tabIndex={-1} class="game-page flex-1">
				<NoHydration>
					{isServer && typeof nonce === 'string' && (
						<script nonce={nonce} innerHTML={captureEarlyPlay} />
					)}
				</NoHydration>
				<section
					class="game-hero relative border-b border-[var(--tactile-soft-line)]"
					classList={{ 'game-hero-stage': props.stage }}
				>
					<div class={props.stage ? 'page-shell pb-2 pt-1' : 'page-shell-wide pb-8 pt-2 md:pb-10'}>
						<nav aria-label={t().breadcrumb} class="text-[13px] text-muted-foreground">
							<ol class="flex flex-wrap items-center gap-x-1.5 gap-y-1">
								<li>
									<a
										href={d().home}
										class="inline-flex min-h-11 items-center hover:text-foreground"
									>
										{t().home}
									</a>
								</li>
								<li aria-hidden="true">/</li>
								<li>
									<a
										href={d().catalog}
										class="inline-flex min-h-11 items-center hover:text-foreground"
									>
										{t().catalog}
									</a>
								</li>
								<li aria-hidden="true">/</li>
								<li aria-current="page" class="font-semibold text-foreground">
									{d().name}
								</li>
							</ol>
						</nav>
						<Show
							when={!props.stage}
							fallback={
								<div class="flex flex-wrap items-center gap-3">
									{title()}
									{featured()}
									<div class="hidden md:block">{facts()}</div>
								</div>
							}
						>
							<div class="mt-1 grid items-center gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] md:gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)]">
								<div class="min-w-0">
									{featured()}
									<div class="mt-3 flex items-center justify-between gap-4">
										{title()}
										<div
											class={`tactile-card h-16 w-[6.25rem] shrink-0 overflow-hidden rounded-xl p-1 md:hidden ${color()}`}
										>
											{motif()}
										</div>
									</div>
									<p class="mt-3 max-w-xl text-[17px] leading-relaxed text-muted-foreground">
										{d().description}
									</p>
									<div class="mt-4">{facts()}</div>
									<a
										href={props.playHref}
										data-start-intent={props.daily ? d().slug : undefined}
										class={`mt-6 ${playButton}`}
										onClick={(event) => {
											if (
												props.daily &&
												!event.defaultPrevented &&
												!event.metaKey &&
												!event.ctrlKey &&
												!event.altKey &&
												!event.shiftKey
											)
												markStartIntent(d().slug)
										}}
									>
										<Play class="h-4 w-4" fill="currentColor" aria-hidden="true" />
										{t().play}
									</a>
									<Show when={props.isGuest}>
										<p class="mt-2 text-sm text-muted-foreground">
											{t().guest}{' '}
											<a
												class="inline-flex min-h-11 items-center font-semibold text-foreground underline underline-offset-4"
												href={localizedPath(
													d().locale,
													`/sign-in?${new URLSearchParams({ callbackUrl: d().canonicalPath })}`,
												)}
											>
												{t().signup}
											</a>
										</p>
									</Show>
								</div>
								<div
									class={`tactile-card hidden aspect-[16/10] overflow-hidden p-4 md:block ${color()}`}
								>
									{motif()}
								</div>
							</div>
						</Show>
					</div>
				</section>
				<section id="play" class="page-shell scroll-mt-16 py-3" aria-label={t().play}>
					{props.children}
				</section>
				<Show when={d().rules.length}>
					<section id="rules" class="section-block">
						<div class="page-shell">
							<h2 class="font-display text-[1.625rem]">{t().rulesTitle}</h2>
							<ol class="mt-5 space-y-2.5">
								<For each={d().rules}>
									{(rule, index) => (
										<li class="flex gap-3.5 text-sm leading-relaxed">
											<span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold numeral">
												{index() + 1}
											</span>
											<span class="pt-0.5">{rule}</span>
										</li>
									)}
								</For>
							</ol>
						</div>
					</section>
				</Show>
				<Show when={d().tips.length}>
					<section class="section-block pt-0">
						<div class="page-shell">
							<h2 class="font-display text-[1.625rem]">{t().tipsTitle}</h2>
							<ul class="mt-3 border-t border-border">
								<For each={d().tips}>
									{(tip) => (
										<li class="flex gap-3.5 border-b border-border py-3.5 text-[15px] leading-relaxed">
											<Lightbulb
												class="mt-1 h-4 w-4 shrink-0 text-muted-foreground"
												aria-hidden="true"
											/>
											{tip}
										</li>
									)}
								</For>
							</ul>
						</div>
					</section>
				</Show>
				<Show when={d().faq.length}>
					<section class="section-block pt-0">
						<div class="page-shell">
							<h2 class="font-display text-[1.625rem]">{t().faqTitle}</h2>
							<div class="mt-3 border-t border-border">
								<For each={d().faq}>
									{(item) => (
										<details class="group border-b border-border">
											<summary class="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 py-3.5 text-[15px] font-semibold marker:content-none">
												{item.question}
												<ChevronDown
													class="h-4 w-4 shrink-0 transition-transform group-open:rotate-180"
													aria-hidden="true"
												/>
											</summary>
											<p class="pb-4 pr-8 text-[15px] leading-relaxed text-muted-foreground">
												{item.answer}
											</p>
										</details>
									)}
								</For>
							</div>
						</div>
					</section>
				</Show>
				<section class="section-block pt-0">
					<div class="page-shell">
						<div class="flex flex-wrap items-center justify-between gap-2">
							<h2 class="font-display text-[1.625rem]">{t().relatedTitle}</h2>
							<a
								class="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4"
								href={d().catalog}
							>
								{t().relatedAll}
							</a>
						</div>
						<ul class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
							<For each={d().related}>
								{(entry) => (
									<li>
										<CatalogTile entry={entry} labels={d().tileLabels} />
									</li>
								)}
							</For>
						</ul>
					</div>
				</section>
				<For each={d().schema}>{(schema) => <JsonLd value={schema} />}</For>
			</main>
		</SiteShell>
	)
}
