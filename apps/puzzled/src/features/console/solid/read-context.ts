import 'server-only'
import type { Locale } from '@/lib/i18n/config'
import type { Translate } from '@/lib/i18n/translate'
import { ogImagePath, pageMetadata } from '@/lib/seo/page-metadata'
import { canonicalSiteOrigin } from '@/lib/site-origin-request'
import { siteShellData } from '@/shared/solid/site-shell-data'

export function consolePresentation(input: {
	locale: Locale
	path: string
	t: Translate
	title: string
	description: string
	eyebrow: string
	request: Request
}) {
	const { locale, path, t, title, description, eyebrow, request } = input
	return {
		locale,
		shell: siteShellData(locale, path, t, new Date()),
		meta: pageMetadata({
			locale,
			path,
			title,
			description,
			baseUrl: canonicalSiteOrigin(request.headers),
			imagePath: ogImagePath({ title, subtitle: description, eyebrow }),
			noindex: true,
		}),
	}
}
