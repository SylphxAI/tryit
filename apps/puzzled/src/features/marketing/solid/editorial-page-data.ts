import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { canonicalSiteOrigin } from '@/lib/site-origin-request'
import { siteShellData } from '@/shared/solid/site-shell-data'

export function editorialPageData(request: Request, locale: Locale, path: string) {
	return {
		origin: canonicalSiteOrigin(request.headers),
		shell: siteShellData(locale, path, createTranslator(locale), new Date()),
	}
}
