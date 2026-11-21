import 'server-only'

import { create } from '@bufbuild/protobuf'
import { createClient } from '@connectrpc/connect'
import { GetTodayOverviewRequestSchema, StatsService } from '@/gen/connect/puzzled/v1/stats_pb'
import { requestConnectTransport } from '@/lib/api/request-connect'
import { getTodaysFreeGame } from '@/lib/free-rotation'
import { slugToCamelCase } from '@/lib/game-slug'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { authConfig, socialProviders } from '@/lib/identity/client-auth'
import { withPresentationDeadline } from '@/lib/presentation-document'
import { ogImagePath, pageMetadata } from '@/lib/seo/page-metadata'
import { canonicalSiteOrigin } from '@/lib/site-origin-request'

export const authPages = {
	login: ['signInTitle', 'signInDescription'],
	signup: ['signUpTitle', 'signUpDescription'],
	'forgot-password': ['forgotPasswordTitle', 'forgotPasswordDescription'],
	'reset-password': ['resetPasswordTitle', 'resetPasswordDescription'],
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
	const config = kind === 'login' || kind === 'signup' ? authConfig() : null
	const [result, providers] = await Promise.all([
		overview,
		config ? socialProviders(config).catch(() => []) : [],
	])
	const [titleKey, descriptionKey] = authPages[kind]
	const title = t(`auth.${titleKey}`)
	const description = t(`auth.${descriptionKey}`)
	return {
		freeGameSlug,
		freeGameName,
		playersToday: result ? Number(result.playerCount) : null,
		providers,
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
