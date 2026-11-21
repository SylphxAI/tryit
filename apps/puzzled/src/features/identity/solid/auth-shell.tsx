/** @jsxImportSource solid-js */
import { ArrowLeft, ArrowRight, Check } from 'lucide-solid'
import { For, type ParentProps } from 'solid-js'
import { MIN_PLAYERS_SHOWN } from '@/features/home/lib/player-count'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { localizedPath } from '@/lib/seo/urls'
import wordmark from '../../../../../../brand/wordmark.json'

function Brand(props: { locale: Locale }) {
	return (
		<a
			href={localizedPath(props.locale)}
			aria-label="Tryit"
			class="inline-flex min-h-11 items-center gap-2"
		>
			{/* biome-ignore lint/performance/noImgElement: static SVG with intrinsic size */}
			<img src="/brand/mark.svg" width={36} height={36} alt="" />
			<svg width={68} height={24} viewBox={wordmark.viewBox} aria-hidden="true">
				<path d={wordmark.path} fill="currentColor" />
			</svg>
		</a>
	)
}

export function AuthShell(
	props: ParentProps<{
		locale: Locale
		freeGameSlug: string
		freeGameName: string
		playersToday: number | null
	}>,
) {
	const translate = createTranslator(props.locale)
	const t = (key: string, values?: Record<string, string | number>) =>
		translate(`auth.${key}`, values)
	const trustPoints = [
		t('brandPanel.trustFree'),
		t('brandPanel.trustNoAccount'),
		t('brandPanel.trustMidnight'),
	]

	return (
		<div class="min-h-screen bg-background">
			<div class="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
				<aside class="surface-ink relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-10 xl:p-14">
					<div class="bg-aurora pointer-events-none absolute inset-0" aria-hidden="true" />
					<div
						class="bg-grid-faint pointer-events-none absolute inset-0 opacity-50"
						aria-hidden="true"
					/>

					<div class="relative">
						<Brand locale={props.locale} />
						<h2 class="mt-10 max-w-md font-display text-3xl leading-tight text-balance text-white xl:text-4xl">
							{t('brandPanel.title')}
						</h2>
						<p class="mt-3 max-w-md text-sm leading-relaxed text-white/80">
							{t('brandPanel.body')}
						</p>

						<div class="mt-8 max-w-md rounded-2xl border border-white/15 bg-white/[0.06] p-4 backdrop-blur">
							<p class="text-xs font-semibold uppercase tracking-[0.14em] text-white/75">
								{t('brandPanel.proofLabel')}
							</p>
							<p class="mt-1.5 font-display text-lg text-white">
								{t('brandPanel.proofGame', { game: props.freeGameName })}
							</p>
							<p class="mt-1 text-sm text-white/80">
								{props.playersToday === null || props.playersToday <= MIN_PLAYERS_SHOWN
									? t('brandPanel.proofNoCount')
									: t('brandPanel.proofPlayers', {
											count: new Intl.NumberFormat(props.locale).format(props.playersToday),
										})}
							</p>
							<a
								href={localizedPath(props.locale, `/games/${props.freeGameSlug}`)}
								class="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/12 px-4 text-sm font-semibold text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-ink)]"
							>
								{t('brandPanel.playFree')}
								<ArrowRight class="h-4 w-4" aria-hidden="true" />
							</a>
						</div>

						<ul class="mt-8 max-w-md space-y-2 text-sm text-white/85">
							<For each={trustPoints}>
								{(point) => (
									<li class="flex items-start gap-2">
										<Check class="mt-0.5 h-4 w-4 shrink-0 text-[#6fcf8e]" aria-hidden="true" />
										{point}
									</li>
								)}
							</For>
						</ul>
					</div>

					<a
						href={localizedPath(props.locale)}
						class="relative mt-10 inline-flex min-h-11 w-fit items-center gap-2 rounded-xl text-sm font-semibold text-white/90 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-ink)]"
					>
						<ArrowLeft class="h-4 w-4" aria-hidden="true" />
						{t('backToPlay')}
					</a>
				</aside>

				<main id="main-content" class="flex flex-col px-4 py-6 sm:px-6 lg:justify-center lg:py-12">
					<div class="mb-6 flex items-center justify-between gap-3 lg:hidden">
						<Brand locale={props.locale} />
						<a
							href={localizedPath(props.locale)}
							class="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
						>
							<ArrowLeft class="h-4 w-4" aria-hidden="true" />
							{t('backToPlay')}
						</a>
					</div>
					<div class="mx-auto w-full max-w-md">{props.children}</div>
				</main>
			</div>
		</div>
	)
}
