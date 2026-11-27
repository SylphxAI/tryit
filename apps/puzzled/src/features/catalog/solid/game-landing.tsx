/** @jsxImportSource solid-js */
import { For, type ParentProps } from 'solid-js'
import { JsonLd } from '@/shared/solid/json-ld'
import { PageMeta } from '@/shared/solid/page-meta'
import { SiteShell } from '@/shared/solid/site-shell'
import {
	renderGameFaq,
	renderGameRules,
	renderGameTips,
	renderRelatedGameTiles,
} from './game-landing-editorial'
import { type GameLandingHeroProps, renderGameLandingHeroBody } from './game-landing-hero'

export { playButton } from './game-landing-actions'

// Render helpers keep the existing Solid hydration scope and dynamic slots.
export function GameLanding(props: ParentProps<GameLandingHeroProps>) {
	const d = () => props.data
	const t = () => d().labels

	return (
		<SiteShell data={d().shell} signedIn={props.signedIn}>
			<PageMeta value={d().meta} />
			<main id="main-content" tabIndex={-1} class="game-page flex-1">
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
						{renderGameLandingHeroBody(props)}
					</div>
				</section>
				<section
					id={props.showDifficulty ? undefined : 'play'}
					tabIndex={-1}
					class="page-shell scroll-mt-16 py-3 empty:hidden"
					aria-label={t().play}
				>
					{props.children}
				</section>
				{renderGameRules(d)}
				{renderGameTips(d)}
				{renderGameFaq(d)}
				<section class="section-block pt-0">
					<div class="page-shell">
						<div class="flex flex-wrap items-center justify-between gap-2">
							<h2 class="font-display text-[1.625rem]">{t().relatedTitle}</h2>
							<a class="chrome-control text-sm" href={d().catalog}>
								{t().relatedAll}
							</a>
						</div>
						<ul class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">{renderRelatedGameTiles(d)}</ul>
					</div>
				</section>
				<For each={d().schema}>{(schema) => <JsonLd value={schema} />}</For>
			</main>
		</SiteShell>
	)
}
