/** @jsxImportSource solid-js */
import { type Accessor, createSignal, For, onCleanup, onMount } from 'solid-js'
import { createTranslator } from '@/lib/i18n/translate'
import { localizedPath } from '@/lib/seo/urls'
import { JsonLd } from '@/shared/solid/json-ld'
import { PageMeta } from '@/shared/solid/page-meta'
import { SiteShell } from '@/shared/solid/site-shell'
import { HomeBanners } from './home-banners'
import { HomeDailySection } from './home-daily-section'
import type { HomeDocument, HomeFacts } from './home-data'
import { HomeEditorial } from './home-editorial'
import { HomeInstallOffer } from './home-install-offer'
import { MarketingFaq } from './marketing-faq'

export function HomePage(props: { page: HomeDocument; facts: Accessor<HomeFacts | undefined> }) {
	const page = props.page
	const t = createTranslator(page.locale)
	const href = (path: string) => localizedPath(page.locale, path)
	const [now, setNow] = createSignal(page.servedAt)
	const [mounted, setMounted] = createSignal(false)
	onMount(() => {
		setMounted(true)
		setNow(Date.now())
		const interval = setInterval(() => setNow(Date.now()), 1000)
		onCleanup(() => clearInterval(interval))
	})
	const format = new Intl.NumberFormat(page.locale)
	return (
		<SiteShell data={page.shell} signedIn={props.facts()?.member}>
			<PageMeta value={page.meta} />
			<main id="main-content" tabIndex={-1} class="flex-1">
				<For each={page.schemas}>{(schema) => <JsonLd value={schema} />}</For>
				<HomeBanners
					page={page}
					facts={props.facts}
					t={t}
					href={href}
					now={now}
					mounted={mounted}
				/>
				<HomeDailySection
					page={page}
					facts={props.facts}
					t={t}
					href={href}
					now={now}
					format={format}
				/>
				<HomeEditorial page={page} facts={props.facts} t={t} href={href} format={format} />
				<MarketingFaq
					id="home-faq"
					title={t('home.faq.title')}
					subtitle={t('home.faq.subtitle')}
					items={page.faqs}
				/>
			</main>
			<HomeInstallOffer
				locale={page.locale}
				dayKey={page.dayKey}
				servedAt={page.servedAt}
				resetAt={page.resetAt}
			/>
		</SiteShell>
	)
}
