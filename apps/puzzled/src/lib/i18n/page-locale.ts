import { defaultLocale, isValidLocale, type Locale, locales } from './config'

export const LOCALE_COOKIE = 'NEXT_LOCALE'

/**
 * Locale prefix match, case-insensitive and tolerant of a locale root URL.
 *
 * The trailing group matters: `/zh-HK` (a locale root) must be recognised as
 * already localised. A pattern that required a trailing slash classified it as
 * unprefixed and the cookie redirect below produced `/zh-HK/zh-HK`, which is a
 * 404 for every visitor who had ever switched language.
 */
const LOCALE_PATTERN = new RegExp(`^/(${locales.join('|')})(?:/|$)`, 'i')

export function localeFromPathname(pathname: string): Locale | null {
	const match = pathname.match(LOCALE_PATTERN)
	if (!match?.[1]) return null
	// The case-insensitive pattern returns the URL's own spelling; map it back
	// to the canonical locale so `/zh-hk/games` is treated as `/zh-HK/games`.
	const canonical = locales.find((entry) => entry.toLowerCase() === match[1].toLowerCase())
	return canonical ?? null
}

/**
 * Remembered-locale redirect for unprefixed paths.
 *
 * Returns the localised path when the visitor's stored language applies, or
 * null when the request already carries a locale or needs no redirect.
 */
export function rememberedLocaleRedirect(
	pathname: string,
	cookieLocale: string | undefined,
): string | null {
	if (!cookieLocale || !isValidLocale(cookieLocale) || cookieLocale === defaultLocale) {
		return null
	}
	if (localeFromPathname(pathname)) {
		return null
	}
	return pathname === '/' ? `/${cookieLocale}` : `/${cookieLocale}${pathname}`
}

export function pageLocale(pathname: string): Locale {
	return localeFromPathname(pathname) ?? defaultLocale
}
