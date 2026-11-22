import 'server-only'
import { createClient } from '@connectrpc/connect'
import { GamificationService } from '@/gen/connect/puzzled/v1/gamification_pb'
import { StatsService } from '@/gen/connect/puzzled/v1/stats_pb'
import { requestConnectTransport } from '@/lib/api/request-connect'
import { getUserStats } from '@/lib/connect/stats-client'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { requestUser } from '@/lib/identity/request-identity'
import { withPresentationDeadline } from '@/lib/presentation-document'
import { projectStreakInfo } from '@/lib/streak-info'
import { consolePresentation } from './read-context'

export async function readProfile(locale: Locale, request: Request) {
	const user = await withPresentationDeadline(requestUser(request), null)
	if (!user) return null
	const transport = requestConnectTransport(request.headers)
	const [stats, streak] = await Promise.all([
		getUserStats({}, createClient(StatsService, transport)).catch(() => null),
		createClient(GamificationService, transport)
			.getStreakInfo({})
			.then((response) => projectStreakInfo(response.info))
			.catch(() => null),
	])
	const t = createTranslator(locale)
	return {
		...consolePresentation({
			locale,
			path: '/profile',
			t,
			title: t('settings.playerCard.pageTitle'),
			description: t('settings.playerCard.pageDescription'),
			eyebrow: 'Tryit',
			request,
		}),
		name: user.name,
		email: user.email,
		emailVerified: user.emailVerified,
		createdAt: user.createdAt,
		finished: stats?.games.reduce((sum, entry) => sum + entry.gamesPlayed, 0) ?? null,
		won: stats?.games.reduce((sum, entry) => sum + entry.gamesWon, 0) ?? null,
		streak: streak?.currentStreak ?? null,
	}
}
