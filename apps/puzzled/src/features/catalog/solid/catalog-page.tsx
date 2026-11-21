/** @jsxImportSource solid-js */
import { ChevronDown, Clock, Search } from 'lucide-solid'
import { For, Show } from 'solid-js'
import {
	type CatalogCategoryFilter,
	filterCatalogEntries,
	parseCatalogCategory,
} from '@/features/catalog/lib/catalog'
import { getGameColors } from '@/games/theme-colors'
import { JsonLd } from '@/shared/solid/json-ld'
import { PageMeta } from '@/shared/solid/page-meta'
import { SiteShell } from '@/shared/solid/site-shell'
import type { CatalogPageData } from './catalog-data'

export function CatalogPage(props: {
	data: CatalogPageData
	query?: string | string[]
	category?: string | string[]
}) {
	const t = () => props.data.labels
	const query = () => (Array.isArray(props.query) ? props.query[0] : props.query)?.trim() ?? ''
	const category = () => parseCatalogCategory(props.category)
	const visible = () =>
		filterCatalogEntries(props.data.entries, { query: query(), category: category() })
	const filterHref = (next: CatalogCategoryFilter) => {
		const search = new URLSearchParams()
		if (query()) search.set('q', query())
		if (next !== 'all') search.set('category', next)
		return props.data.path + (search.size ? `?${search.toString()}` : '')
	}
	return (
		<SiteShell data={props.data.shell}>
			<PageMeta value={props.data.meta} />
			<main id="main-content" class="flex-1">
				<section class="relative">
					<div class="page-shell-wide pb-4 pt-6 md:pt-10">
						<div class="grid items-end gap-x-10 gap-y-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
							<div class="min-w-0">
								<p class="eyebrow">{t().eyebrow}</p>
								<h1 class="mt-2 font-display text-[2.125rem] leading-[1.06] text-balance sm:text-5xl">
									{t().title}
								</h1>
								<p class="mt-3 max-w-2xl text-[16px] leading-relaxed text-muted-foreground sm:text-[17px]">
									{t().subtitle}
								</p>
							</div>
							<search class="block">
								<form method="get" action={props.data.path} class="relative w-full">
									<label for="catalog-q" class="sr-only">
										{t().searchLabel}
									</label>
									<Search
										class="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
										aria-hidden="true"
									/>
									<input
										id="catalog-q"
										type="search"
										name="q"
										value={query()}
										placeholder={t().searchPlaceholder}
										enterkeyhint="search"
										class="h-12 w-full rounded-xl border-[1.5px] border-[var(--tactile-soft-line)] bg-card pl-10 pr-24 text-[16px] outline-none transition-colors placeholder:text-muted-foreground focus:border-ring"
									/>
									<Show when={category() !== 'all'}>
										<input type="hidden" name="category" value={category()} />
									</Show>
									<button
										type="submit"
										class="absolute right-0.5 top-0.5 inline-flex h-11 min-w-11 items-center rounded-lg px-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
									>
										{t().searchSubmit}
									</button>
								</form>
							</search>
						</div>
						<fieldset class="no-scrollbar min-w-0 -mx-4 mt-5 flex items-center gap-2 overflow-x-auto border-0 py-1 ps-4 pe-10 [mask-image:linear-gradient(to_right,#000_calc(100%-2.5rem),transparent)] md:mx-0 md:px-0 md:[mask-image:none]">
							<legend class="sr-only">{t().filterLabel}</legend>
							<For each={props.data.filters}>
								{(filter) => (
									<a
										href={filterHref(filter.value)}
										aria-current={category() === filter.value ? 'page' : undefined}
										class="category-chip pressable min-h-11 shrink-0 px-4 text-sm"
										classList={{ 'category-chip-on': category() === filter.value }}
									>
										{filter.label}
									</a>
								)}
							</For>
						</fieldset>
						<div class="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
							<output>{props.data.counts[visible().length]}</output>
							<Show when={query() || category() !== 'all'}>
								<a
									href={props.data.path}
									class="font-semibold text-foreground underline underline-offset-4"
								>
									{t().clearFilter}
								</a>
							</Show>
						</div>
					</div>
				</section>
				<section class="pb-12 md:pb-16" aria-labelledby="catalog-suite">
					<div class="page-shell-wide">
						<h2 id="catalog-suite" class="sr-only">
							{t().suiteTitle}
						</h2>
						<Show
							when={visible().length}
							fallback={
								<div class="mt-5 rounded-3xl border border-dashed border-border px-6 py-12 text-center">
									<p class="font-display text-lg">{t().emptyTitle}</p>
									<p class="mt-1 text-sm text-muted-foreground">{t().emptyDescription}</p>
									<a
										href={props.data.path}
										class="pressable mt-4 inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground"
									>
										{t().clearFilter}
									</a>
								</div>
							}
						>
							<ul class="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4">
								<For each={visible()}>
									{(entry) => (
										<li class="h-full">
											<CatalogTile entry={entry} labels={t()} />
										</li>
									)}
								</For>
							</ul>
						</Show>
					</div>
				</section>
				<section class="section-block pt-0">
					<div class="page-shell-wide">
						<h2 class="font-display text-2xl md:text-3xl">{t().faqTitle}</h2>
						<p class="mt-2 max-w-2xl text-muted-foreground">{t().faqBody}</p>
						<div class="mt-6 grid gap-3 md:grid-cols-2">
							<For each={props.data.faqs}>
								{(faq) => (
									<details class="group rounded-2xl border border-border/70 bg-card px-5 py-4 open:shadow-card">
										<summary class="flex cursor-pointer list-none items-center justify-between gap-3 py-1 font-display text-base marker:content-none">
											{faq.question}
											<ChevronDown
												class="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
												aria-hidden="true"
											/>
										</summary>
										<p class="mt-2.5 text-sm leading-relaxed text-muted-foreground">{faq.answer}</p>
									</details>
								)}
							</For>
						</div>
					</div>
				</section>
				<JsonLd value={props.data.faqSchema} />
				<JsonLd value={props.data.itemList} />
			</main>
		</SiteShell>
	)
}

function CatalogTile(props: {
	entry: CatalogPageData['entries'][number]
	labels: CatalogPageData['labels']
}) {
	const game = () => props.entry
	return (
		<a
			href={game().href}
			data-game-tile={game().slug}
			class="tactile-card group relative flex h-full flex-col overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
		>
			<div
				class={
					'tactile-card-field relative aspect-[16/10] overflow-hidden px-3 py-2 ' +
					getGameColors(game().theme).bg
				}
			>
				{/* biome-ignore lint/performance/noImgElement: decorative static SVG with intrinsic size */}
				<img
					src={`/motifs/${game().slug}.svg`}
					alt=""
					aria-hidden="true"
					width={160}
					height={100}
					loading="lazy"
					decoding="async"
					class="block h-full w-full object-contain transition-transform duration-medium ease-out group-hover:scale-[1.04]"
				/>
				<Show when={game().freeToday}>
					<span class="absolute left-2 top-2 rounded-full bg-[#1a1712] px-2 py-0.5 text-[11px] font-semibold leading-4 text-[#fbf9f4]">
						{props.labels.freeToday}
					</span>
				</Show>
			</div>
			<div class="flex flex-1 flex-col p-3.5 sm:p-4">
				<h3 class="game-tile-title min-w-0 font-display text-[1.0625rem] leading-tight sm:text-lg">
					{game().title}
				</h3>
				<p class="mt-1 line-clamp-2 flex-1 text-[13px] leading-snug text-muted-foreground sm:text-sm">
					{game().tagline}
				</p>
				<p class="mt-3 flex flex-wrap items-center gap-1.5 text-xs font-medium text-foreground">
					<span class="tag-chip numeral">
						<Clock class="h-3 w-3" aria-hidden="true" />
						{game().duration}
					</span>
					<span class="tag-chip">{game().categoryLabel}</span>
					<span class="sr-only"> — {props.labels.play}</span>
				</p>
			</div>
		</a>
	)
}
