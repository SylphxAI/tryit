/** @jsxImportSource solid-js */
import { ChevronDown, Clock, Search } from 'lucide-solid'
import { For, Show } from 'solid-js'
import {
	type CatalogCategoryFilter,
	filterCatalogEntries,
	parseCatalogCategory,
} from '@/features/catalog/lib/catalog'
import { gameFamilyColor } from '@/games/theme-colors'
import { JsonLd } from '@/shared/solid/json-ld'
import { PageMeta } from '@/shared/solid/page-meta'
import { SiteShell } from '@/shared/solid/site-shell'
import type { CatalogPageData } from './catalog-data'

export function CatalogPage(props: {
	data: CatalogPageData
	signedIn: boolean
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
		<SiteShell data={props.data.shell} signedIn={props.signedIn}>
			<PageMeta value={props.data.meta} />
			<main id="main-content" tabIndex={-1} class="flex-1">
				<section>
					<div class="page-shell-wide pb-3 pt-4 md:pt-8">
						<div class="grid items-end gap-x-10 gap-y-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
							<div class="min-w-0">
								<h1 class="editorial-title">{t().title}</h1>
								<p class="mt-1 max-w-2xl text-base leading-normal text-muted-foreground sm:text-[17px]">
									{t().subtitle}
								</p>
							</div>
							<search class="block">
								<form method="get" action={props.data.path} class="flex gap-1 min-[375px]:gap-2">
									<label for="catalog-q" class="sr-only">
										{t().searchLabel}
									</label>
									<input
										id="catalog-q"
										type="search"
										name="q"
										value={query()}
										placeholder={t().searchPlaceholder}
										enterkeyhint="search"
										class="min-h-12 min-w-0 flex-1 rounded-xl border border-border bg-card px-1 text-base placeholder:text-muted-foreground focus:border-ring min-[375px]:px-2 sm:px-3"
									/>
									<Show when={category() !== 'all'}>
										<input type="hidden" name="category" value={category()} />
									</Show>
									<button
										type="submit"
										class="inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-card px-3 text-sm font-semibold hover:bg-accent"
									>
										<Search class="size-4 min-[375px]:hidden" aria-hidden="true" />
										<span class="sr-only min-[375px]:not-sr-only">{t().searchSubmit}</span>
									</button>
								</form>
							</search>
						</div>
						<fieldset class="mt-3 min-w-0 border-0">
							<legend class="sr-only">{t().filterLabel}</legend>
							<div class="flex flex-wrap gap-1.5">
								<For each={props.data.filters}>
									{(filter) => (
										<a
											href={filterHref(filter.value)}
											aria-current={category() === filter.value ? 'page' : undefined}
											class={`category-chip family-pill min-h-12 min-w-12 justify-center px-2 text-sm sm:px-4 ${filter.value === 'all' ? '' : gameFamilyColor[filter.value]}`}
											classList={{ 'category-chip-on': category() === filter.value }}
										>
											{filter.label}
										</a>
									)}
								</For>
							</div>
						</fieldset>
						<div class="mt-2 flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
							<output>{props.data.counts[visible().length]}</output>
							<Show when={query() || category() !== 'all'}>
								<a
									href={props.data.path}
									class="inline-flex min-h-12 items-center font-semibold text-foreground underline underline-offset-4"
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
								<div class="rounded-3xl border border-dashed border-border px-6 py-12 text-center">
									<p class="font-display text-lg">{t().emptyTitle}</p>
									<p class="mt-1 text-sm text-muted-foreground">{t().emptyDescription}</p>
									<a
										href={props.data.path}
										class="pressable mt-4 inline-flex min-h-12 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground"
									>
										{t().clearFilter}
									</a>
								</div>
							}
						>
							<ul class="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4">
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
									<details class="editorial-surface group rounded-2xl px-5 py-4">
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

export function CatalogTile(props: {
	entry: CatalogPageData['entries'][number]
	labels: CatalogPageData['labels']
}) {
	const game = () => props.entry
	return (
		<a
			href={game().href}
			data-game-tile={game().slug}
			class="editorial-surface editorial-interactive group relative flex h-full flex-col overflow-hidden rounded-2xl"
		>
			<div
				class={
					'family-field relative aspect-[16/10] overflow-hidden border-b border-hairline px-3 py-2 ' +
					gameFamilyColor[game().category]
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
					class="block h-full w-full object-contain motion-safe:transition-transform motion-safe:group-hover:scale-[1.04]"
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
					<span class={`tag-chip family-pill ${gameFamilyColor[game().category]}`}>
						{game().categoryLabel}
					</span>
					<span class="sr-only"> — {props.labels.play}</span>
				</p>
			</div>
		</a>
	)
}
