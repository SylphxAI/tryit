/** @jsxImportSource solid-js */
import { createAsync, useParams } from '@solidjs/router'
import { For, Show } from 'solid-js'
import { COMPANY_PHONE } from '@/lib/config/app'
import { defaultLocale } from '@/lib/i18n/config'
import { localizedPath } from '@/lib/seo/urls'
import { PageMeta } from '@/shared/solid/page-meta'
import { SiteShell } from '@/shared/solid/site-shell'
import { type Policy, readPolicy } from './policy-route'

export function PolicyPage(props: { kind: Policy }) {
	const params = useParams()
	const data = createAsync(() => readPolicy(params.locale ?? defaultLocale, props.kind), {
		deferStream: true,
	})
	return (
		<Show when={data()} keyed>
			{(page) => (
				<>
					<PageMeta value={page.meta} />
					<SiteShell data={page.shell}>
						<main id="main-content" tabIndex={-1} class="page-shell-wide flex-1 space-y-7 py-10">
							<header class="max-w-3xl space-y-3">
								<p class="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
									{page.eyebrow}
								</p>
								<h1 class="font-display text-4xl sm:text-5xl">{page.title}</h1>
								<p class="text-base leading-relaxed text-muted-foreground">{page.lead}</p>
							</header>
							<div class="grid gap-7 lg:grid-cols-[14rem_minmax(0,1fr)]">
								<details class="surface-card self-start p-4" open>
									<summary class="cursor-pointer font-semibold">{page.toc}</summary>
									<nav aria-label={page.toc} class="mt-2">
										<ul>
											<For each={page.sections}>
												{(section) => (
													<li>
														<a
															class="inline-flex min-h-10 items-center underline-offset-4 hover:underline"
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
									<Show when={page.revised}>
										<p class="text-sm text-muted-foreground">
											{page.updated}: <time dateTime={page.revision}>{page.revised}</time>
										</p>
									</Show>
									<For each={page.sections}>
										{(section) => (
											<section id={section.id} class="scroll-mt-24 space-y-3">
												<h2 class="font-display text-2xl">{section.title}</h2>
												<For each={section.paragraphs}>{(paragraph) => <p>{paragraph}</p>}</For>
												<Show when={section.bullets.length || section.providers.length}>
													<ul class="list-disc space-y-2 ps-5">
														<For each={section.bullets}>{(bullet) => <li>{bullet}</li>}</For>
														<For each={section.providers}>
															{(provider) => (
																<li>
																	<strong>{provider.name}</strong> – {provider.description}
																</li>
															)}
														</For>
													</ul>
												</Show>
												<Show when={section.after}>
													<p>{section.after}</p>
												</Show>
												<Show when={section.id === 'contact'}>
													<p class="flex flex-wrap gap-4">
														<a class="underline" href={`mailto:${page.email}`}>
															{page.email}
														</a>
														<a class="underline" href={`tel:${COMPANY_PHONE.replace(/\s/g, '')}`}>
															{COMPANY_PHONE}
														</a>
													</p>
												</Show>
											</section>
										)}
									</For>
									<a class="underline" href={localizedPath(page.locale, `/${page.alternate}`)}>
										{page.alternateTitle}
									</a>
								</article>
							</div>
						</main>
					</SiteShell>
				</>
			)}
		</Show>
	)
}
