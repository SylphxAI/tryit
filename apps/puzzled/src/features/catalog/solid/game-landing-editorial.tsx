/** @jsxImportSource solid-js */
import { ChevronDown, Lightbulb } from 'lucide-solid'
import { type Accessor, For, Show } from 'solid-js'
import { CatalogTile } from './catalog-page'
import type { GamePageData } from './game-data'

export function renderGameRules(d: Accessor<GamePageData>) {
	const t = () => d().labels
	return (
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
	)
}

export function renderGameTips(d: Accessor<GamePageData>) {
	const t = () => d().labels
	return (
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
	)
}

export function renderGameFaq(d: Accessor<GamePageData>) {
	const t = () => d().labels
	return (
		<Show when={d().faq.length}>
			<section id="game-faq" class="section-block pt-0">
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
	)
}

export function renderRelatedGameTiles(d: Accessor<GamePageData>) {
	return (
		<For each={d().related}>
			{(entry) => (
				<li>
					<CatalogTile entry={entry} labels={d().tileLabels} />
				</li>
			)}
		</For>
	)
}
