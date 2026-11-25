/** @jsxImportSource solid-js */
import { createAsync, useLocation, useParams } from '@solidjs/router'
import { HttpHeader } from '@solidjs/start'
import { Target, Trophy } from 'lucide-solid'
import { createEffect, For, onCleanup, Show } from 'solid-js'
import { hasExplicitAnalyticsConsent, onConsentChange } from '@/features/analytics/lib/consent'
import { sendFunnel } from '@/features/analytics/lib/funnel'
import { rememberChallenge } from '@/features/daily/lib/challenge'
import { resultCardChips, resultCardStringsFrom } from '@/features/daily/lib/result-card'
import { createPuzzleServiceClient } from '@/lib/connect/puzzle-client'
import { defaultLocale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { PageMeta } from '@/shared/solid/page-meta'
import { SiteShell } from '@/shared/solid/site-shell'
import { readSharePage } from './share-route'

type SharePageData = Awaited<ReturnType<typeof readSharePage>>

function ShareLanding(props: { data: SharePageData }) {
	const t = createTranslator(props.data.locale)
	const landing = (key: string) => t(`share.landing.${key}`)
	const strings = resultCardStringsFrom((key) => String(t.raw(`share.card.${key}`)))
	createEffect(() => {
		const { shareId, memory } = props.data
		if (memory) {
			try {
				rememberChallenge(window.localStorage, memory)
			} catch {
				/* blocked storage */
			}
		}
		if (!shareId) return
		sendFunnel({ event: 'share_landing' })
		const sync = () => {
			try {
				if (hasExplicitAnalyticsConsent())
					void createPuzzleServiceClient()
						.recordShareLanding({ shareId, analyticsConsent: true })
						.catch(() => {})
			} catch {
				/* telemetry never blocks play */
			}
		}
		sync()
		onCleanup(onConsentChange(sync))
	})
	const heading = t('share.challenge.theirs')
	return (
		<main id="main-content" tabIndex={-1} class="flex-1 page-shell py-10 md:py-16">
			<div class="mx-auto w-full max-w-md">
				<p class="text-center text-sm font-medium text-muted-foreground">{landing('eyebrow')}</p>
				<h1 class="mt-2 text-balance text-center font-display text-[2rem] leading-tight md:text-4xl">
					{landing(props.data.sameAsShared ? 'titleSame' : 'titleOther')}
				</h1>
				<Show when={props.data.card} keyed>
					{(card) => {
						const won = card.status === 'won'
						const chips = resultCardChips(card, strings)
						return (
							<div class="mt-6">
								<p class="mb-2 text-center text-[15px]">
									<span class="font-semibold">{card.gameName}</span>
									<Show when={card.dayDisplay}>
										<span class="text-muted-foreground"> · {card.dayDisplay}</span>
									</Show>
								</p>
								<section
									class="rounded-2xl border border-border bg-card p-4 shadow-card"
									aria-label={heading}
								>
									<p class="text-xs font-medium text-muted-foreground">{heading}</p>
									<p class="mt-1 flex items-center gap-2 font-display text-xl leading-tight">
										<span
											aria-hidden="true"
											class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
											classList={{
												'bg-accent-warm text-[#1a1712]': won,
												'bg-muted text-muted-foreground': !won,
											}}
										>
											{won ? <Trophy size={16} /> : <Target size={16} />}
										</span>
										{won ? strings.statusWon : strings.statusLost}
									</p>
									<Show when={chips.length}>
										<dl class="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
											<For each={chips}>
												{(chip) => (
													<div>
														<dt class="text-xs text-muted-foreground">{chip.label}</dt>
														<dd class="text-[15px] font-semibold tnum">{chip.value}</dd>
													</div>
												)}
											</For>
										</dl>
									</Show>
								</section>
							</div>
						)
					}}
				</Show>
				<p class="mt-6 text-center text-[15px] text-muted-foreground">
					{landing(props.data.sameAsShared ? 'bodySame' : 'bodyOther')}
				</p>
				<a
					href={props.data.playHref}
					class="pressable mt-5 flex h-12 w-full items-center justify-center rounded-full bg-cta px-6 text-[16px] font-bold text-cta-foreground shadow-[inset_0_-3px_0_var(--color-cta-edge)] transition-colors hover:bg-cta-hover"
				>
					{t('home.day.playToday', { game: props.data.playName })}
				</a>
				<p class="mt-3 text-center text-xs text-muted-foreground">{landing('note')}</p>
			</div>
		</main>
	)
}

export function SharePage() {
	const params = useParams()
	const location = useLocation()
	const page = createAsync(
		() => readSharePage(params.locale ?? defaultLocale, params.shareId ?? null, location.search),
		{ deferStream: true },
	)
	return (
		<>
			<HttpHeader name="Cache-Control" value="private, no-store" />
			<Show when={page()} keyed>
				{(data) => (
					<>
						<PageMeta value={data.meta} />
						<SiteShell data={data.shell}>
							<ShareLanding data={data} />
						</SiteShell>
					</>
				)}
			</Show>
		</>
	)
}
