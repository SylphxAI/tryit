import type { Locale } from '@/lib/i18n/config'

// Keep children at the root so their scope covers any page on the site,
// including the default locale's unprefixed pages.
export function localeSitemapPath(locale: Locale): string {
	return `/sitemap.${locale}.xml`
}
