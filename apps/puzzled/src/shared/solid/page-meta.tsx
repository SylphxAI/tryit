/** @jsxImportSource solid-js */
import { Link, Meta, Title } from '@solidjs/meta'
import { For } from 'solid-js'
import type { PageMetadata } from '@/lib/seo/page-metadata'

import { SiteSchema } from './site-schema'

export function PageMeta(props: { value: PageMetadata }) {
	const value = () => props.value
	const og = () => value().openGraph
	const image = () => og().images[0]
	return (
		<>
			<SiteSchema origin={new URL(value().alternates.canonical).origin} />
			<Title>{value().title} | Tryit</Title>
			<Meta name="description" content={value().description} />
			{value().robots && <Meta name="robots" content="noindex, nofollow" />}
			<Link rel="canonical" href={value().alternates.canonical} />
			<For each={Object.entries(value().alternates.languages ?? {})}>
				{([language, href]) => <Link rel="alternate" hreflang={language} href={href} />}
			</For>
			<Meta property="og:type" content={og().type} />
			<Meta property="og:site_name" content={og().siteName} />
			<Meta property="og:url" content={og().url} />
			<Meta property="og:locale" content={og().locale} />
			<For each={og().alternateLocale}>
				{(locale) => <Meta property="og:locale:alternate" content={locale} />}
			</For>
			<Meta property="og:title" content={og().title} />
			<Meta property="og:description" content={og().description} />
			<Meta property="og:image" content={image().url} />
			<Meta property="og:image:width" content={String(image().width)} />
			<Meta property="og:image:height" content={String(image().height)} />
			<Meta property="og:image:alt" content={image().alt} />
			<Meta name="twitter:card" content={value().twitter.card} />
			<Meta name="twitter:title" content={og().title} />
			<Meta name="twitter:description" content={og().description} />
			<Meta name="twitter:image" content={image().url} />
		</>
	)
}
