import 'server-only'

import { create } from '@bufbuild/protobuf'
import { createClient } from '@connectrpc/connect'
import { GetTodayOverviewRequestSchema, StatsService } from '@/gen/connect/puzzled/v1/stats_pb'
import { requestConnectTransport } from '@/lib/api/request-connect'
import { getTodaysFreeGame } from '@/lib/free-rotation'
import { slugToCamelCase } from '@/lib/game-slug'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { authConfig, clientMethods } from '@/lib/identity/client-auth'
import { withPresentationDeadline } from '@/lib/presentation-document'
import { ogImagePath, pageMetadata } from '@/lib/seo/page-metadata'
import { canonicalSiteOrigin } from '@/lib/site-origin-request'

export const authPages = {
	'sign-in': ['signInTitle', 'signInDescription'],
	'reset-password': ['resetPasswordTitle', 'resetPasswordDescription'],
	'verify-email': ['confirmEmailTitle', 'verifiedSignInGuidance'],
} as const

async function readTodayOverview() {
	// This is a public aggregate, not a personalized progress request.
	const stats = createClient(StatsService, requestConnectTransport())
	return stats.getTodayOverview(create(GetTodayOverviewRequestSchema))
}

export async function readAuthPage(locale: Locale, kind: keyof typeof authPages, request: Request) {
	const t = createTranslator(locale)
	const freeGameSlug = getTodaysFreeGame()
	const gameKey = `games.${slugToCamelCase(freeGameSlug)}.name`
	const freeGameName = t.has(gameKey) ? t(gameKey) : freeGameSlug
	const overview = withPresentationDeadline(readTodayOverview(), null)
	const config = kind === 'sign-in' ? authConfig() : null
	const [result, methods] = await Promise.all([
		overview,
		config ? clientMethods(config).catch(() => null) : null,
	])
	const [titleKey, descriptionKey] = authPages[kind]
	const title = t(`auth.${titleKey}`)
	const description = t(`auth.${descriptionKey}`)
	return {
		freeGameSlug,
		freeGameName,
		playersToday: result ? Number(result.playerCount) : null,
		methods,
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
