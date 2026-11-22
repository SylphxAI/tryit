/** @jsxImportSource solid-js */
import { createAsync, query, type RouteDefinition, useParams } from '@solidjs/router'
import {
	ArrowRight,
	Check,
	ChevronDown,
	Clock,
	KeyRound,
	type LucideIcon,
	Mail,
	ScrollText,
	ShieldCheck,
} from 'lucide-solid'
import { For, Show } from 'solid-js'
import { Dynamic, getRequestEvent } from 'solid-js/web'
import { APP_NAME, SUPPORT_EMAIL } from '@/lib/config/app'
import { defaultLocale, isValidLocale, type Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { ogImagePath, pageMetadata } from '@/lib/seo/page-metadata'
import { localizedPath } from '@/lib/seo/urls'
import { JsonLd } from '@/shared/solid/json-ld'
import { PageMeta } from '@/shared/solid/page-meta'
import { SiteShell } from '@/shared/solid/site-shell'
import { siteShellData } from '@/shared/solid/site-shell-data'
import { FAQ_KEYS } from '../support-faq-keys'
import { MarketingCta } from './marketing-cta'
import { MarketingHero } from './marketing-hero'
import { MarketingSection } from './marketing-section'

/** Fields a support message needs before a person can act on it. */
const INCLUDE_KEYS = ['account', 'game', 'detail', 'screenshot'] as const

type ResourceKey = 'reset' | 'privacy' | 'terms'

/** Routes that exist today; the FAQ answers point at the same destinations. */
const RESOURCES: Record<ResourceKey, { href: string; icon: LucideIcon }> = {
	reset: { href: '/sign-in?recovery=1', icon: KeyRound },
	privacy: { href: '/privacy', icon: ShieldCheck },
	terms: { href: '/terms', icon: ScrollText },
}

const RESOURCE_KEYS: readonly ResourceKey[] = ['reset', 'privacy', 'terms']

const PRIMARY_CTA =
	'inline-flex h-12 items-center gap-2 rounded-2xl bg-primary px-6 font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-transform hover:-translate-y-0.5 hover:bg-primary-hover active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

const SECONDARY_CTA =
	'inline-flex h-12 items-center gap-2 rounded-2xl border border-border bg-background/80 px-5 font-semibold backdrop-blur transition-colors hover:border-primary/30 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

const INLINE_LINK =
	'inline-flex min-h-11 items-center gap-2 font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

const readSupport = query(async (localeParam: string) => {
	'use server'
	const request = getRequestEvent()?.request
	if (!request) throw new Error('Support page needs a request')
	const { canonicalSiteOrigin } = await import('@/lib/site-origin-request')
	const locale = isValidLocale(localeParam) ? localeParam : defaultLocale
	const t = createTranslator(locale)
	const title = t('support.title')
	return {
		locale,
		shell: siteShellData(locale, '/support', t, new Date()),
		meta: pageMetadata({
			locale,
			path: '/support',
			title,
			description: t('support.description'),
			imagePath: ogImagePath({
				title,
				subtitle: t('support.hero.lead'),
				eyebrow: t('support.hero.eyebrow'),
			}),
			baseUrl: canonicalSiteOrigin(request.headers),
		}),
	}
}, 'support-page')

export const supportRoute: RouteDefinition = {
	matchFilters: { locale: isValidLocale },
	preload: ({ params }) => readSupport(params.locale ?? defaultLocale),
}

export function SupportPage() {
	const params = useParams()
	const page = createAsync(() => readSupport(params.locale ?? defaultLocale), { deferStream: true })
	return (
		<Show when={page()} keyed>
			{(data) => (
				<>
					<PageMeta value={data.meta} />
					<SiteShell data={data.shell}>
						<SupportContent locale={data.locale} />
					</SiteShell>
				</>
			)}
		</Show>
	)
}

function SupportContent(props: { locale: Locale }) {
	const translate = createTranslator(props.locale)
	const t = (key: string, values?: { email: string }) => translate(`support.${key}`, values)

	// One prefilled subject keeps every mailto on this page in the same thread.
	const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`${APP_NAME} Support Request`)}`

	// Two answers quote the one public address, so the reader never has to leave
	// the page to find it.
	const faqItems = FAQ_KEYS.map((key) => {
		const values = key === 'refunds' || key === 'data' ? { email: SUPPORT_EMAIL } : undefined
		return {
			question: t(`faq.${key}.question`),
			answer: t(`faq.${key}.answer`, values),
		}
	})

	return (
		<main id="main-content" class="flex-1">
			<MarketingHero
				eyebrow={t('hero.eyebrow')}
				title={t('title')}
				lead={t('hero.lead')}
				facts={[t('hero.factHuman'), t('hero.factReply')]}
				actions={
					<>
						<a href={mailto} class={PRIMARY_CTA}>
							<Mail class="h-4 w-4" aria-hidden="true" />
							{t('hero.emailCta')}
						</a>
						<a href="#faq" class={SECONDARY_CTA}>
							{t('hero.faqCta')}
							<ArrowRight class="h-4 w-4" aria-hidden="true" />
						</a>
					</>
				}
				aside={
					<div
						class="surface-card shadow-glow animate-enter p-5 md:p-6"
						style={{ '--enter-delay': '120ms' }}
					>
						<h2 class="font-display text-base">{t('include.title')}</h2>
						<ul class="mt-3 space-y-2.5 text-sm leading-relaxed text-muted-foreground">
							<For each={INCLUDE_KEYS}>
								{(key) => (
									<li class="flex gap-2.5">
										<Check class="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
										<span>{t(`include.${key}`)}</span>
									</li>
								)}
							</For>
						</ul>
					</div>
				}
			/>

			<MarketingSection
				id="contact"
				title={t('contact.title')}
				subtitle={t('contact.subtitle')}
				flush
			>
				<ul class="grid gap-3">
					<li class="surface-card p-5 md:p-6">
						<span class="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
							<Mail class="h-5 w-5" aria-hidden="true" />
						</span>
						<h3 class="mt-3 font-display text-base">{t('contact.support.title')}</h3>
						<p class="mt-1 text-sm leading-relaxed text-muted-foreground">
							{t('contact.support.body')}
						</p>
						<a href={mailto} class={`${INLINE_LINK} mt-3`}>
							<Mail class="h-4 w-4" aria-hidden="true" />
							{SUPPORT_EMAIL}
						</a>
						<p class="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
							<Clock class="h-4 w-4 shrink-0" aria-hidden="true" />
							{t('email.responseTime')}
						</p>
					</li>
				</ul>
				<p class="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
					{t('contact.note')}
				</p>
			</MarketingSection>

			<MarketingSection id="faq" title={t('faq.title')} subtitle={t('faq.subtitle')}>
				<div class="grid border-t border-border md:grid-cols-2 md:gap-x-10">
					<For each={faqItems}>
						{(item) => (
							<details class="group border-b border-border">
								<summary class="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3.5 text-[15px] font-semibold marker:content-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
									{item.question}
									<ChevronDown
										aria-hidden="true"
										class="h-4 w-4 shrink-0 text-muted-foreground group-open:rotate-180"
									/>
								</summary>
								<p class="pb-4 pr-8 text-[15px] leading-relaxed text-muted-foreground">
									{item.answer}
								</p>
							</details>
						)}
					</For>
				</div>
				<JsonLd
					value={{
						'@context': 'https://schema.org',
						'@type': 'FAQPage',
						mainEntity: faqItems.map((item) => ({
							'@type': 'Question',
							name: item.question,
							acceptedAnswer: { '@type': 'Answer', text: item.answer },
						})),
					}}
				/>
			</MarketingSection>

			<MarketingSection
				id="resources"
				title={t('resources.title')}
				subtitle={t('resources.subtitle')}
			>
				<ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					<For each={RESOURCE_KEYS}>
						{(key) => {
							const { href, icon: Icon } = RESOURCES[key]
							return (
								<li>
									<a
										href={localizedPath(props.locale, href)}
										class="surface-card surface-card-hover flex min-h-11 items-start gap-3 p-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
									>
										<Dynamic
											component={Icon}
											class="mt-0.5 h-5 w-5 shrink-0 text-primary"
											aria-hidden="true"
										/>
										<span>
											<span class="block font-display text-base">
												{t(`resources.${key}.title`)}
											</span>
											<span class="mt-1 block text-sm leading-relaxed text-muted-foreground">
												{t(`resources.${key}.body`)}
											</span>
										</span>
									</a>
								</li>
							)
						}}
					</For>
				</ul>
			</MarketingSection>

			<MarketingCta title={t('cta.title')} body={t('cta.body')} note={SUPPORT_EMAIL}>
				<a href={mailto} class={PRIMARY_CTA}>
					<Mail class="h-4 w-4" aria-hidden="true" />
					{t('hero.emailCta')}
				</a>
			</MarketingCta>
		</main>
	)
}
