import { defaultLocale, type Locale, localeFacts, locales } from '@/lib/i18n/config'

/** BCP 47 tags used by `<html lang>` and the hreflang cluster. */
export const HREFLANG: Record<Locale, string> = localeFacts('tag')

/** Locale-prefixed pathname; the default locale has no prefix. */
export function localizedPath(locale: Locale | string, path = '/'): string {
	const normalized = path === '/' ? '' : path.startsWith('/') ? path : `/${path}`
	if (locale === defaultLocale) return normalized || '/'
	return `/${locale}${normalized}`
}

/** Absolute self-referencing URL for one page. */
export function canonicalUrl(baseUrl: string, locale: Locale | string, path = '/'): string {
	const localized = localizedPath(locale, path)
	// The site root is the bare origin: `https://tryit.fun` and
	// `https://tryit.fun/` are one URL to a crawler, and the served canonical
	// for the home page is the origin itself.
	return localized === '/' ? baseUrl : `${baseUrl}${localized}`
}

/**
 * The hreflang cluster for one locale-agnostic path: every supported locale
 * plus `x-default` pointing at the default-locale URL.
 *
 * Canonical and cluster are always derived from the same base URL + path, so a
 * page can never advertise alternates that point at a different route — and
 * the sitemap can reuse the exact cluster the HTML emits.
 */
export function hreflangLanguages(baseUrl: string, path = '/'): Record<string, string> {
	return Object.fromEntries([
		['x-default', canonicalUrl(baseUrl, defaultLocale, path)],
		...locales.map((entry) => [HREFLANG[entry], canonicalUrl(baseUrl, entry, path)]),
	])
}
