import 'server-only'
import { createClient } from '@connectrpc/connect'
import { parseCookie } from 'cookie-es'
import { getNextAchievements } from '@/features/gamification/lib/achievements'
import { offerAccess, plusOfferOpen, selectOfferPrices } from '@/features/plus-offer/lib/plus-offer'
import { getAllGameMetadata } from '@/games/registry'
import { GamificationService } from '@/gen/connect/puzzled/v1/gamification_pb'
import { PuzzleService } from '@/gen/connect/puzzled/v1/puzzle_pb'
import { StatsService } from '@/gen/connect/puzzled/v1/stats_pb'
import { isEmptyGuestRecord, isNoIdentityError } from '@/lib/api/no-identity'
import { requestBilling } from '@/lib/api/request-billing'
import {
	hasPlayAccountCookie,
	hasProgressCookie,
	requestConnectTransport,
} from '@/lib/api/request-connect'
import {
	availableCurrencies,
	COUNTRY_HEADER,
	CURRENCY_COOKIE,
	chooseCurrency,
} from '@/lib/billing/currency'
import { OPEN_ACCESS, planCards } from '@/lib/billing/plus'
import { getHistory, getUserStats } from '@/lib/connect/stats-client'
import { slugToCamelCase } from '@/lib/game-slug'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { requestUser } from '@/lib/identity/request-identity'
import { withPresentationDeadline } from '@/lib/presentation-document'
import { productDayKey } from '@/lib/product-day'
import { projectStreakInfo, type StreakInfo } from '@/lib/streak-info'
import { buildFinishCalendar, moduleStatRows, winRatePercent } from '../lib/finish-activity'
import { consolePresentation } from './read-context'

const HISTORY_LIMIT = 100
const HISTORY_ROWS = 12

/** A missing member read is never an empty guest record, even when Auth is down. */
async function readProgress<T>(
	knownIdentity: boolean,
	memberSession: boolean,
	read: () => Promise<T>,
	empty: T,
) {
	if (!knownIdentity) return empty
	try {
		return await read()
	} catch (reason) {
		return isEmptyGuestRecord(memberSession, { status: 'rejected', reason }) ? empty : null
	}
}

async function readTodaysCompletions(
	client: ReturnType<typeof createClient<typeof PuzzleService>>,
	gameSlugs: string[],
	memberSession: boolean,
) {
	const read = () => client.getTodayProgress({ gameSlugs })
	try {
		let response: Awaited<ReturnType<typeof read>>
		try {
			response = await read()
		} catch (error) {
			if (isNoIdentityError(error)) throw error
			response = await read()
		}
		const games = new Map(response.games.map((game) => [game.gameSlug, game.hasCompleted]))
		return gameSlugs.every((slug) => games.has(slug))
			? gameSlugs.filter((slug) => games.get(slug))
			: null
	} catch (error) {
		return !memberSession && isNoIdentityError(error) ? [] : null
	}
}

async function readStatsOffer(locale: Locale, request: Request, memberSession: boolean) {
	const billing = requestBilling(request.headers)
	// Don't fall back to the guest catalogue to decide a signed-in viewer's offer.
	const access = await withPresentationDeadline(
		memberSession
			? billing
					.subscription()
					.then((view) =>
						offerAccess(true, { salesOpen: view.salesOpen, entitled: view.entitled }, 'failed'),
					)
			: billing.listPlans().then((plans) => offerAccess(false, 'failed', plans.salesOpen)),
		OPEN_ACCESS,
	)
	if (!plusOfferOpen(access)) return null
	const plans = await withPresentationDeadline(billing.listPlans(), null)
	if (!plans?.salesOpen) return {}
	const currency = chooseCurrency({
		cookie: parseCookie(request.headers.get('cookie') ?? '')[CURRENCY_COOKIE],
		country: request.headers.get(COUNTRY_HEADER),
		locale,
		available: availableCurrencies(plans.plans),
	})
	return selectOfferPrices(planCards(plans.plans, currency), currency, locale)
}

export async function readStats(locale: Locale, request: Request) {
	const t = createTranslator(locale)
	const modules = getAllGameMetadata().map((game) => {
		const key = `games.${slugToCamelCase(game.slug)}.name`
		return { slug: game.slug, name: t.has(key) ? t(key) : game.name }
	})
	const transport = requestConnectTransport(request.headers)
	const stats = createClient(StatsService, transport)
	const memberSession = hasPlayAccountCookie(request.headers)
	const hasIdentity = hasProgressCookie(request.headers)
	const [user, counts, sessions, streakResult, completedSlugs, offerPrices] = await Promise.all([
		withPresentationDeadline(requestUser(request), null),
		readProgress(hasIdentity, memberSession, async () => (await getUserStats({}, stats)).games, []),
		readProgress(hasIdentity, memberSession, () => getHistory({ limit: HISTORY_LIMIT }, stats), []),
		readProgress<{ info: StreakInfo | null }>(
			hasIdentity,
			memberSession,
			async () => ({
				info: projectStreakInfo(
					(await createClient(GamificationService, transport).getStreakInfo({})).info,
				),
			}),
			{ info: null },
		),
		readTodaysCompletions(
			createClient(PuzzleService, transport),
			modules.map((game) => game.slug),
			memberSession,
		),
		readStatsOffer(locale, request, memberSession),
	])
	const moduleRows = moduleStatRows(
		Object.fromEntries(
			(counts ?? []).map((row) => [row.gameSlug, { ...row, totalScore: row.bestScore }]),
		),
		modules,
	)
	const totalFinished = moduleRows.reduce((sum, row) => sum + row.played, 0)
	const totalWon = moduleRows.reduce((sum, row) => sum + row.won, 0)
	const streak = streakResult?.info ?? null
	const milestones =
		counts !== null && streakResult !== null
			? getNextAchievements({ totalWins: totalWon, maxStreak: streak?.maxStreak ?? 0 }).map(
					(achievement) => ({
						id: achievement.id,
						metric: (achievement.category === 'streak' ? 'streak' : 'wins') as 'streak' | 'wins',
						tier: achievement.tier,
						progress: achievement.progress ?? 0,
						target: achievement.target ?? 1,
					}),
				)
			: null
	return {
		...consolePresentation({
			locale,
			path: '/stats',
			t,
			title: t('stats.title'),
			description: t('stats.metaDescription'),
			eyebrow: t('stats.eyebrow'),
			request,
		}),
		signedIn: Boolean(user),
		memberSession,
		memberLabel: user?.name?.trim() || user?.email || t('stats.identity.player'),
		modules,
		moduleRows,
		totalFinished,
		totalWon,
		winRate: winRatePercent(totalFinished, totalWon),
		statsKnown: counts !== null,
		historyKnown: sessions !== null,
		streakKnown: streakResult !== null,
		streak,
		completedSlugs,
		calendar: buildFinishCalendar({ sessions: sessions ?? [], todayKey: productDayKey() }),
		history: (sessions ?? []).slice(0, HISTORY_ROWS).map(({ puzzleId: _, ...session }) => session),
		milestones,
		everythingUnreadable: counts === null && sessions === null && streakResult === null,
		nothingRecorded: counts !== null && totalFinished === 0 && sessions?.length === 0,
		offerPrices,
	}
}

export type StatsPageData = Awaited<ReturnType<typeof readStats>>
