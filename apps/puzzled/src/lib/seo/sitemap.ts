import { getGameSlugs } from '@/games/registry'
import { defaultLocale, locales } from '@/lib/i18n/config'
import {
	type ChangeFrequency,
	GAME_PAGE_ROUTE,
	PUBLIC_ROUTES,
	type PublicRoute,
} from '@/lib/seo/routes'
import { canonicalUrl, hreflangLanguages } from '@/lib/seo/urls'

interface SitemapEntry {
	url: string
	changeFrequency: ChangeFrequency
	priority: number
	alternates?: { languages: Record<string, string> }
}

/**
 * `/sitemap.xml` — public indexable URLs only.
 *
 * Localised routes emit one entry per locale carrying the reciprocal hreflang
 * cluster the HTML emits (`xhtml:link` alternates). English-only editorial
 * routes (`/vs`, `/vs/*`, `/use-cases/*`) emit only the canonical `en-US` URL
 * so untranslated locale duplicates never dilute search equity. Private,
 * per-user and transactional surfaces are absent by construction;
 * `lib/seo/routes.ts` owns that split and `scripts/seo-verify.ts` asserts it
 * against a served build.
 *
 * No `lastmod`: the app has no per-URL modification date, and stamping every
 * URL with the build time would publish a freshness signal that is not real.
 */
export function buildSitemap(baseUrl: string): SitemapEntry[] {
	const pages: readonly PublicRoute[] = [
		...PUBLIC_ROUTES,
		...getGameSlugs().map((slug) => ({ path: `/games/${slug}`, ...GAME_PAGE_ROUTE })),
	]

	return pages.flatMap((page) => {
		if (page.englishOnly) {
			return [
				{
					url: canonicalUrl(baseUrl, defaultLocale, page.path),
					changeFrequency: page.changeFrequency,
					priority: page.priority,
				},
			]
		}
		const languages = hreflangLanguages(baseUrl, page.path)
		return locales.map((locale) => ({
			url: canonicalUrl(baseUrl, locale, page.path),
			changeFrequency: page.changeFrequency,
			priority: page.priority,
			alternates: { languages },
		}))
	})
}

function escapeXml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;')
}

export function serveSitemap(baseUrl: string): Response {
	const entries = buildSitemap(baseUrl).map(({ url, changeFrequency, priority, alternates }) => {
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
	})
	return new Response(
		[
			'<?xml version="1.0" encoding="UTF-8"?>',
			'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
			...entries,
			'</urlset>',
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
