import 'server-only'
import { createClient } from '@connectrpc/connect'
import { getAllGameMetadata } from '@/games/registry'
import { StatsService } from '@/gen/connect/puzzled/v1/stats_pb'
import { requestConnectTransport } from '@/lib/api/request-connect'
import { getLeaderboard } from '@/lib/connect/stats-client'
import { getTodaysFreeGame } from '@/lib/free-rotation'
import { slugToCamelCase } from '@/lib/game-slug'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { requestUser } from '@/lib/identity/request-identity'
import { withPresentationDeadline } from '@/lib/presentation-document'
import { toLeaderboardModule, toLeaderboardPeriod } from '../lib/leaderboard-period'
import { consolePresentation } from './read-context'

export async function readLeaderboard(
	locale: Locale,
	periodParam: string | undefined,
	moduleParam: string | undefined,
	request: Request,
) {
	const t = createTranslator(locale)
	const modules = getAllGameMetadata().map((game) => {
		const key = `games.${slugToCamelCase(game.slug)}.name`
		return { slug: game.slug, name: t.has(key) ? t(key) : game.name }
	})
	const period = toLeaderboardPeriod(periodParam)
	const selected = toLeaderboardModule(moduleParam, modules, getTodaysFreeGame())
	const moduleSlug = selected?.slug ?? ''
	const moduleName = selected?.name ?? ''
	const [user, board] = await Promise.all([
		withPresentationDeadline(requestUser(request), null),
		moduleSlug
			? getLeaderboard(
					{ gameSlug: moduleSlug, type: 'score', period, limit: 10 },
					createClient(StatsService, requestConnectTransport(request.headers)),
				).catch(() => null)
			: null,
	])
	return {
		...consolePresentation({
			locale,
			path: '/leaderboard',
			t,
			title: t('leaderboard.title'),
			description: t('leaderboard.metaDescription'),
			eyebrow: t('leaderboard.eyebrow'),
			request,
		}),
		modules,
		moduleSlug,
		moduleName,
		period,
		viewerSignedIn: !!user,
		entries:
			board?.entries.map((entry) => ({
				rank: entry.rank,
				name: entry.userName.trim() || t('leaderboard.anonymous'),
				score: entry.value,
				isViewer: !!user && entry.isViewer,
			})) ?? null,
	}
}

export type LeaderboardData = Awaited<ReturnType<typeof readLeaderboard>>
