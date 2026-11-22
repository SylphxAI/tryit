import { defaultLocale, type Locale, localeFacts, locales } from '@/lib/i18n/config'
import { canonicalUrl, hreflangLanguages } from './urls'

/** Open Graph locale codes for the supported locales. */
const OG_LOCALES: Record<Locale, string> = localeFacts('ogLocale')

export type BuildPageMetadataInput = {
	locale: Locale | string
	/** Route path without locale prefix, e.g. `/games/sudoku`. */
	path?: string
	title: string
	description: string
	/** Absolute or root-relative social image; defaults to the OG route. */
	imagePath?: string
	/** Extra alt text for the social image. */
	imageAlt?: string
	type?: 'website' | 'article'
	/** Private or thin surfaces opt out of search indexing. */
	noindex?: boolean
	/** Set false for post-auth or utility routes that need no language cluster. */
	withAlternates?: boolean
	/**
	 * Set true for English-only editorial routes (`/vs`, `/vs/*`, `/use-cases/*`):
	 * canonicalises every locale hit to the `en-US` URL and omits hreflang alternates.
	 */
	englishOnly?: boolean
	/** Override the request origin (tests, cron-built artifacts). */
	baseUrl?: string
}

/**
 * Full metadata for one public page: canonical, hreflang cluster, Open Graph
 * and Twitter card stay consistent by construction.
 */
export function pageMetadata({
	locale,
	path = '/',
	title,
	description,
	imagePath,
	imageAlt,
	type = 'website',
	noindex = false,
	withAlternates = true,
	englishOnly = false,
	baseUrl,
}: BuildPageMetadataInput & { baseUrl: string }) {
	const canonicalLocale = englishOnly ? defaultLocale : locale
	const canonical = canonicalUrl(baseUrl, canonicalLocale, path)
	// Default to a card carrying this page's own title: a shared static banner
	// makes every shared link look the same.
	const image = imagePath?.startsWith('http')
		? imagePath
		: `${baseUrl}${imagePath ?? ogImagePath({ title })}`
	const alt = imageAlt ?? title

	const emitAlternates = withAlternates && !englishOnly
	const languages = emitAlternates ? hreflangLanguages(baseUrl, path) : undefined
	// These regional editions share many titles with their language's base
	// edition, but serve different regional experiences at their own URLs.
	// Distinguish their document titles without changing social cards or hreflang.
	// A UK comparison has local pricing but still belongs to the English-only
	// editorial canonical. Its rendered document title can differ independently.
	const region = locale === 'en-GB' ? ' (UK)' : locale === 'zh-TW' ? '（台灣）' : ''
	const regionalTitle = emitAlternates || (englishOnly && locale === 'en-GB')
	const documentTitle = `${title}${regionalTitle && !noindex ? region : ''} | Tryit`

	return {
		documentTitle,
		title,
		description,
		...(noindex ? { robots: { index: false, follow: false } } : {}),
		alternates: emitAlternates ? { canonical, languages } : { canonical },
		openGraph: {
			type,
			siteName: 'Tryit',
			url: canonical,
			locale: OG_LOCALES[canonicalLocale as Locale] ?? 'en_US',
			...(emitAlternates
				? {
						alternateLocale: locales
							.filter((entry) => entry !== canonicalLocale)
							.map((entry) => OG_LOCALES[entry]),
					}
				: {}),
			title,
			description,
			images: [{ url: image, width: 1200, height: 630, alt }],
		},
		twitter: {
			card: 'summary_large_image' as const,
			title,
			description,
			images: [image],
		},
	}
}

/** URL for the dynamic Open Graph image of a page. */
export function ogImagePath(params: {
	title: string
	subtitle?: string
	eyebrow?: string
	badge?: string
	theme?: string
}): string {
	const search = new URLSearchParams({ title: params.title })
	if (params.subtitle) search.set('subtitle', params.subtitle)
	if (params.eyebrow) search.set('eyebrow', params.eyebrow)
	if (params.badge) search.set('badge', params.badge)
	if (params.theme) search.set('theme', params.theme)
	return `/og?${search.toString()}`
}

export type PageMetadata = ReturnType<typeof pageMetadata>
