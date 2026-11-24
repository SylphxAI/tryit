import { getGameSlugs } from '@/games/registry'
import { defaultLocale, type Locale, locales } from '@/lib/i18n/config'
import {
	type ChangeFrequency,
	GAME_PAGE_ROUTE,
	PUBLIC_ROUTES,
	type PublicRoute,
} from '@/lib/seo/routes'
import { localeSitemapPath } from '@/lib/seo/sitemap-paths'
import { canonicalUrl, hreflangLanguages } from '@/lib/seo/urls'

interface SitemapEntry {
	url: string
	changeFrequency: ChangeFrequency
	priority: number
	alternates?: { languages: Record<string, string> }
}

const pages: readonly PublicRoute[] = [
	...PUBLIC_ROUTES,
	...getGameSlugs().map((slug) => ({ path: `/games/${slug}`, ...GAME_PAGE_ROUTE })),
]

/** Localised entries carry the same reciprocal hreflang cluster as the HTML.
 * English-only editorial entries belong only in the default locale's sitemap.
 */
export function buildLocaleSitemap(baseUrl: string, locale: Locale): SitemapEntry[] {
	return pages
		.filter((page) => !page.englishOnly || locale === defaultLocale)
		.map((page) => ({
			url: canonicalUrl(baseUrl, locale, page.path),
			changeFrequency: page.changeFrequency,
			priority: page.priority,
			alternates: page.englishOnly
				? undefined
				: { languages: hreflangLanguages(baseUrl, page.path) },
		}))
}

function escapeXml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;')
}

const SITEMAP_NS = 'http://www.sitemaps.org/schemas/sitemap/0.9'

function xmlResponse(root: string, entries: string[], attributes = ''): Response {
	// No lastmod: we have no per-URL dates, and build time is not content freshness.
	return new Response(
		[
			'<?xml version="1.0" encoding="UTF-8"?>',
			`<${root} xmlns="${SITEMAP_NS}"${attributes}>`,
			...entries,
			`</${root}>`,
			'',
		].join('\n'),
		{
			headers: {
				'Content-Type': 'application/xml; charset=utf-8',
				'Cache-Control': 'public, max-age=3600',
			},
		},
	)
}

export function serveSitemapIndex(baseUrl: string): Response {
	return xmlResponse(
		'sitemapindex',
		locales.map(
			(locale) =>
				`  <sitemap><loc>${escapeXml(baseUrl + localeSitemapPath(locale))}</loc></sitemap>`,
		),
	)
}

export function serveLocaleSitemap(baseUrl: string, locale: Locale): Response {
	const entries = buildLocaleSitemap(baseUrl, locale).map(
		({ url, changeFrequency, priority, alternates }) => {
			const links = Object.entries(alternates?.languages ?? {}).map(
				([language, href]) =>
					`    <xhtml:link rel="alternate" hreflang="${escapeXml(language)}" href="${escapeXml(href)}" />`,
			)
			return [
				'  <url>',
				`    <loc>${escapeXml(url)}</loc>`,
				...links,
				`    <changefreq>${changeFrequency}</changefreq>`,
				`    <priority>${priority}</priority>`,
				'  </url>',
			].join('\n')
		},
	)
	return xmlResponse('urlset', entries, ' xmlns:xhtml="http://www.w3.org/1999/xhtml"')
}
