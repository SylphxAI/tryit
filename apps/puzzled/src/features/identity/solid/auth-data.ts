import 'server-only'

import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { readEntryConfig } from '@/lib/identity/oauth-server'
import { ogImagePath, pageMetadata } from '@/lib/seo/page-metadata'
import { canonicalSiteOrigin } from '@/lib/site-origin-request'

export const authPages = {
	'sign-in': ['signInTitle', 'signInDescription'],
	'reset-password': ['resetPasswordTitle', 'resetPasswordDescription'],
	'verify-email': ['confirmEmailTitle', 'verifiedSignInGuidance'],
} as const

export async function readAuthPage(locale: Locale, kind: keyof typeof authPages, request: Request) {
	const t = createTranslator(locale)
	const entry = kind === 'sign-in' ? await readEntryConfig(request) : null
	const [titleKey, descriptionKey] = authPages[kind]
	const title = t(`auth.${titleKey}`)
	const description = t(`auth.${descriptionKey}`)
	return {
		entry,
		meta: pageMetadata({
			locale,
			path: `/${kind}`,
			title,
			description,
			baseUrl: canonicalSiteOrigin(request.headers),
			noindex: true,
			withAlternates: false,
			imagePath: ogImagePath({ title, subtitle: description, eyebrow: 'Tryit' }),
		}),
	}
}
