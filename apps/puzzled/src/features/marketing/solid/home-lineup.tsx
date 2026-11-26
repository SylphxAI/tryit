/** @jsxImportSource solid-js */
import { ArrowRight } from 'lucide-solid'
import { For } from 'solid-js'
import { CATALOG_CATEGORIES } from '@/features/catalog/lib/catalog'
import type { HomeGamePlayState } from '@/features/daily/lib/home-play-state'
import { todayPlayPath, todayResultPath } from '@/features/daily/lib/today-play-path'
import { lineupStatus } from '@/features/home/lib/home-day-copy'
import { gameFamilyColor } from '@/games/theme-colors'
import type { Translate } from '@/lib/i18n/translate'
import type { HomeDocument } from './home-data'
import { HomeGameCard } from './home-game-card'

export function HomeLineup(props: {
	page: HomeDocument
	t: Translate
	href: (path: string) => string
	games: readonly HomeGamePlayState[]
	onStart: (event: MouseEvent, slug: string) => void
}) {
	const { page, t, href } = props
	const bySlug = new Map(page.catalog.map((game) => [game.slug, game]))
	return (
		<section aria-labelledby="home-lineup-title" class="home-lineup min-w-0">
			<div class="flex flex-wrap items-end justify-between gap-x-3">
				<div>
					<h2 id="home-lineup-title" class="font-display text-2xl">
						{t('home.lineup.title')}
					</h2>
				</div>
				<a class="chrome-control gap-1" href={href('/games')}>
					{t('home.lineup.seeAll')}
					<ArrowRight size={16} aria-hidden="true" />
				</a>
			</div>
			<ul class="no-scrollbar -mx-1 flex gap-2 overflow-x-auto p-1 md:flex-wrap">
				<For each={CATALOG_CATEGORIES}>
					{(value) => (
						<li class="shrink-0">
							<a
								class={`category-chip family-pill ${gameFamilyColor[value]}`}
								href={href(`/games?category=${value}`)}
							>
								{t(`catalog.category.${value}`)}
								<span class="numeral text-muted-foreground">
									{page.catalog.filter((game) => game.category === value).length}
								</span>
							</a>
						</li>
					)}
				</For>
			</ul>
			<ul class="mt-2 grid grid-cols-2 gap-3 sm:mt-3 sm:grid-cols-3 xl:grid-cols-4">
				<For each={props.games.filter(({ slug }) => slug !== page.featured.slug)}>
					{(state) => {
						const game = bySlug.get(state.slug)
						if (!game) return null
						const kind = lineupStatus(state)
						return (
							<HomeGameCard
								game={game}
								status={kind}
								href={href(
									kind === 'solved' ? todayResultPath(game.slug) : todayPlayPath(game.slug),
								)}
								onClick={(event) => kind !== 'solved' && props.onStart(event, game.slug)}
								caption={
									kind === 'solved'
										? [t('gameResult.seeResult'), state.score].filter(Boolean).join(' · ')
										: kind === 'free'
											? t('home.lineup.freeToday')
											: game.duration
								}
							/>
						)
					}}
				</For>
			</ul>
		</section>
	)
}
