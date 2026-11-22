/** @jsxImportSource solid-js */
import { createAsync, query, type RouteDefinition } from '@solidjs/router'
import { For, Show } from 'solid-js'
import { getRequestEvent } from 'solid-js/web'
import { MarketingHero } from '@/features/marketing/solid/marketing-hero'
import {
	TOKUSHOHO_LEAD as LEAD,
	TOKUSHOHO_SECTIONS as sections,
	TOKUSHOHO_TITLE as TITLE,
} from '@/features/marketing/tokushoho-content'
import { createTranslator } from '@/lib/i18n/translate'
import { pageMetadata } from '@/lib/seo/page-metadata'
import { PageMeta } from '@/shared/solid/page-meta'
import { SiteShell } from '@/shared/solid/site-shell'
import { siteShellData } from '@/shared/solid/site-shell-data'

const locale = 'ja'
const path = '/tokushoho'
const tocTitle = '目次'

const readDisclosure = query(async () => {
	'use server'
	const request = getRequestEvent()?.request
	if (!request) throw new Error('Seller disclosure needs a request')
	const { canonicalSiteOrigin } = await import('@/lib/site-origin-request')
	const shell = siteShellData(locale, path, createTranslator(locale), new Date())
	return {
		shell: { ...shell, languages: shell.languages.filter((entry) => entry.code === locale) },
		meta: pageMetadata({
			locale,
			path,
			title: TITLE,
			description: LEAD,
			withAlternates: false,
			baseUrl: canonicalSiteOrigin(request.headers),
		}),
	}
}, 'seller-disclosure')

export const route: RouteDefinition = {
	preload: () => readDisclosure(),
}

export default function TokushohoPage() {
	const page = createAsync(() => readDisclosure(), { deferStream: true })
	return (
		<Show when={page()} keyed>
			{(data) => (
				<>
					<PageMeta value={data.meta} />
					<SiteShell data={data.shell}>
						<main id="main-content" tabIndex={-1} class="flex-1">
							<MarketingHero eyebrow="法的情報" title={TITLE} lead={LEAD} />
							<div class="page-shell-wide grid gap-7 pb-10 lg:grid-cols-[14rem_minmax(0,1fr)]">
								<details class="surface-card self-start p-4" open>
									<summary class="cursor-pointer font-semibold">{tocTitle}</summary>
									<nav aria-label={tocTitle} class="mt-2">
										<ul>
											<For each={sections}>
												{(section) => (
													<li>
														<a
															class="inline-flex min-h-10 items-center hover:underline"
															href={`#${section.id}`}
														>
															{section.title}
														</a>
													</li>
												)}
											</For>
										</ul>
									</nav>
								</details>
								<article class="max-w-[72ch] space-y-8 leading-relaxed">
									<For each={sections}>
										{(section) => (
											<section id={section.id} class="scroll-mt-24 space-y-3">
												<h2 class="font-display text-2xl">{section.title}</h2>
												<For each={section.paragraphs}>{(paragraph) => <p>{paragraph}</p>}</For>
												<Show when={section.contactEmail}>
													{(email) => (
														<p>
															<a class="underline" href={`mailto:${email()}`}>
																{email()}
															</a>
														</p>
													)}
												</Show>
												<Show when={section.contactPhone}>
													{(phone) => (
														<p>
															<a class="underline" href={`tel:${phone().replace(/\s/g, '')}`}>
																{phone()}
															</a>
														</p>
													)}
												</Show>
											</section>
										)}
									</For>
								</article>
							</div>
						</main>
					</SiteShell>
				</>
			)}
		</Show>
	)
}
