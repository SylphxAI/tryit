/** @jsxImportSource solid-js */
import { ArrowLeft, Check } from 'lucide-solid'
import { For, type ParentProps } from 'solid-js'
import { ARCHIVE_WINDOW_DAYS } from '@/features/daily/lib/archive-days'
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
	}>,
) {
	const translate = createTranslator(props.locale)
	const t = (key: string, values?: Record<string, string | number>) =>
		translate(`auth.${key}`, values)
	const benefits = [
		t('brandPanel.syncStreaks'),
		t('brandPanel.saveStats'),
		t('brandPanel.plusArchive', { count: ARCHIVE_WINDOW_DAYS }),
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
						<ul class="mt-5 max-w-md space-y-3 text-base leading-relaxed text-white/90">
							<For each={benefits}>
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

				<main
					id="main-content"
					tabIndex={-1}
					class="flex flex-col px-4 py-6 sm:px-6 lg:justify-center lg:py-12"
				>
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
