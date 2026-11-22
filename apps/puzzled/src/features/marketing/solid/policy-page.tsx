/** @jsxImportSource solid-js */
import { createAsync, query, type RouteDefinition, useParams } from '@solidjs/router'
import { For, Show } from 'solid-js'
import { getRequestEvent } from 'solid-js/web'
import { COMPANY_PHONE, LEGAL_EMAIL, PRIVACY_EMAIL } from '@/lib/config/app'
import { defaultLocale, isValidLocale, locales } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { ogImagePath, pageMetadata } from '@/lib/seo/page-metadata'
import { localizedPath } from '@/lib/seo/urls'
import { PageMeta } from '@/shared/solid/page-meta'
import { SiteShell } from '@/shared/solid/site-shell'
import { siteShellData } from '@/shared/solid/site-shell-data'

type Policy = 'terms' | 'privacy'
const order: Record<Policy, readonly string[]> = {
	terms: [
		'keyTerms',
		'acceptance',
		'seller',
		'service',
		'accounts',
		'subscriptions',
		'conduct',
		'suspension',
		'ip',
		'disclaimer',
		'liability',
		'changes',
		'general',
		'contact',
	],
	privacy: [
		'intro',
		'controller',
		'dataCollection',
		'dataUse',
		'payments',
		'thirdParty',
		'transfers',
		'retention',
		'cookies',
		'rights',
		'children',
		'security',
		'changes',
		'contact',
	],
}
const afterKeys: Record<string, string> = {
	dataUse: 'items.noSale',
	thirdParty: 'others',
	rights: 'response',
}
const providers = [
	['Stripe', 'stripe'],
	['Google', 'google'],
	['Google Analytics, Google Ads', 'googleMeasurement'],
	['Sylphx Limited', 'mail'],
] as const

const readPolicy = query(async (localeParam: string, kind: Policy) => {
	'use server'
	const request = getRequestEvent()?.request
	if (!request) throw new Error('Policy document needs a request')
	const { canonicalSiteOrigin } = await import('@/lib/site-origin-request')
	const locale = isValidLocale(localeParam) ? localeParam : defaultLocale
	const translate = createTranslator(locale)
	const t = (key: string) => translate(`legal.${kind}.${key}`)
	const sections = order[kind].map((id) => {
		const path = `sections.${id}`
		const items = translate.raw(`legal.${kind}.${path}.items`)
		const bullets =
			items && typeof items === 'object'
				? Object.keys(items)
						.filter((key) => key !== 'noSale')
						.map((key) => t(`${path}.items.${key}`))
				: []
		const paragraphs = [t(`${path}.content`)]
		if (id === 'cookies') paragraphs.push(t(`${path}.notices`), t(`${path}.google`))
		const afterKey = afterKeys[id]
		return {
			id,
			title: t(`${path}.title`),
			paragraphs,
			bullets,
			providers:
				id === 'thirdParty'
					? providers.map(([name, key]) => ({ name, description: t(`${path}.${key}`) }))
					: [],
			after: afterKey ? t(`${path}.${afterKey}`) : null,
		}
	})
	const title = t('title')
	const lead = t('lead')
	const eyebrow = t('eyebrow')
	const revision = t('revision')
	const date = new Date(`${revision}T00:00:00Z`)
	const revised = Number.isFinite(date.getTime())
		? new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(date)
		: null
	const path = `/${kind}`
	return {
		shell: siteShellData(locale, path, translate, new Date()),
		meta: pageMetadata({
			locale,
			path,
			title,
			description: lead,
			baseUrl: canonicalSiteOrigin(request.headers),
			imagePath: ogImagePath({ title, subtitle: lead, eyebrow }),
		}),
		locale,
		title,
		lead,
		eyebrow,
		revision,
		revised,
		updated: t('lastUpdated'),
		toc: t('toc.title'),
		sections,
		alternate: kind === 'terms' ? 'privacy' : 'terms',
		alternateTitle: translate(kind === 'terms' ? 'legal.privacy.title' : 'legal.terms.title'),
		email: kind === 'terms' ? LEGAL_EMAIL : PRIVACY_EMAIL,
	}
}, 'policy-document')

export function policyRoute(kind: Policy): RouteDefinition {
	return {
		matchFilters: { locale: (value: string) => locales.some((l) => l === value) },
		preload: ({ params }) => readPolicy(params.locale ?? defaultLocale, kind),
	}
}

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
