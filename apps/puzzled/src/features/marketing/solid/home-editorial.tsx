/** @jsxImportSource solid-js */
import { type Accessor, For, Show, Suspense } from 'solid-js'
import type { Translate } from '@/lib/i18n/translate'
import type { HomeDocument, HomeFacts } from './home-data'

export function HomeEditorial(props: {
	page: HomeDocument
	facts: Accessor<HomeFacts | undefined>
	t: Translate
	href: (path: string) => string
	format: Intl.NumberFormat
}) {
	const { page, t, href, format } = props
	return (
		<>
			<Suspense>
				<Show
					when={props.facts()?.member}
					fallback={
						<section class="page-shell-wide grid gap-5 py-8 md:grid-cols-3">
							<For each={['daily', 'honest', 'share']}>
								{(key) => (
									<div>
										<h2 class="font-display text-xl">{t(`home.value.${key}Title`)}</h2>
										<p class="mt-1 text-muted-foreground">{t(`home.value.${key}Body`)}</p>
									</div>
								)}
							</For>
						</section>
					}
				>
					<section class="page-shell-wide py-8">
						<Show when={props.facts()?.streak}>
							{(streak) => (
								<dl class="grid grid-cols-3 gap-2">
									<For
										each={
											[
												['currentStreak', streak().currentStreak],
												['bestStreak', streak().maxStreak],
												['gamesPlayed', streak().totalGamesPlayed],
											] as const
										}
									>
										{([key, value]) => (
											<div>
												<dt>{t(`home.member.${key}`)}</dt>
												<dd class="numeral text-2xl font-semibold">{format.format(value)}</dd>
											</div>
										)}
									</For>
								</dl>
							)}
						</Show>
						<a class="inline-flex min-h-11 items-center underline" href={href('/stats')}>
							{t('home.member.viewStats')}
						</a>
					</section>
				</Show>
			</Suspense>
			<section class="border-y border-hairline bg-surface-muted">
				<div class="page-shell-wide flex flex-wrap items-center justify-between gap-3 py-8">
					<div>
						<h2 class="font-display text-2xl">
							{t('home.tomorrow.title', { game: page.tomorrow })}
						</h2>
						<p class="text-muted-foreground">{t('home.tomorrow.body')}</p>
					</div>
					<a class="chrome-control" href={href('/games')}>
						{t('home.tomorrow.cta')}
					</a>
				</div>
			</section>
		</>
	)
}
