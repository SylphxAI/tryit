import type { Locale } from '@/lib/i18n/config'
import { serveLocaleSitemap, serveSitemapIndex } from '@/lib/seo/sitemap'
import { getServerBaseUrl } from '@/lib/utils'

export function GET() {
	// Use the deployment's origin, never the request host or a session.
	return serveSitemapIndex(getServerBaseUrl())
}

export function localeSitemap(locale: Locale) {
	return () => serveLocaleSitemap(getServerBaseUrl(), locale)
}
