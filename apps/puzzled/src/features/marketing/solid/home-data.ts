import { createClient } from '@connectrpc/connect'
import { parseCookie } from 'cookie-es'
import { DISMISSED_COOKIE } from '@/features/announcements/lib/dismissed'
import { getServerActiveAnnouncements } from '@/features/announcements/lib/public-announcements'
import { visibleAnnouncements } from '@/features/announcements/lib/visible'
import { claimedDailyPicks, dailyPickCount } from '@/features/daily/lib/daily-picks'
import { deriveHomeExposure } from '@/features/daily/lib/home-exposure'
import type { HomePersonalResult } from '@/features/daily/lib/home-play-state'
import { getPuzzleNumber } from '@/features/daily/lib/puzzle-utils'
import { HOME_FAQ_KEYS } from '@/features/home/lib/home-faq'
import { homeOfferSchemas } from '@/features/home/lib/home-offer-schemas'
import { dueMilestone, seenMilestones } from '@/features/plus-offer/lib/plus-offer'
import { seasonForInstant } from '@/features/seasons/lib/seasons'
import { getAllGameMetadata } from '@/games/registry'
import { GamificationService } from '@/gen/connect/puzzled/v1/gamification_pb'
import { PuzzleService } from '@/gen/connect/puzzled/v1/puzzle_pb'
import { StatsService } from '@/gen/connect/puzzled/v1/stats_pb'
import { mapTodayProgress } from '@/lib/api/domain/daily'
import { requestBilling } from '@/lib/api/request-billing'
import {
	hasAccountSessionCookie,
	hasProgressCookie,
	requestConnectTransport,
} from '@/lib/api/request-connect'
import { getTodaysFreeGame, getTomorrowsFreeGame } from '@/lib/free-rotation'
import { slugToCamelCase } from '@/lib/game-slug'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { requestUser } from '@/lib/identity/request-identity'
import { withPresentationDeadline } from '@/lib/presentation-document'
import { nextProductDayStart, productDayKey } from '@/lib/product-day'
import { ogImagePath, pageMetadata } from '@/lib/seo/page-metadata'
import { projectStreakInfo } from '@/lib/streak-info'
import { siteShellData } from '@/shared/solid/site-shell-data'

export function homeDocument(locale: Locale, baseUrl: string, now: Date) {
	const t = createTranslator(locale)
	const catalog = getAllGameMetadata().map(({ slug, sortOrder, category, display }) => ({
		slug,
		sortOrder,
		category,
		duration: t('common.estimatedPlayTime', { minutes: display.durationMinutes }),
		theme: display.theme,
		name: t(`games.${slugToCamelCase(slug)}.name`),
		tagline: t(`games.${slugToCamelCase(slug)}.tagline`),
	}))
	const dayKey = productDayKey(now)
	const freeGameSlug = getTodaysFreeGame(now)
	const featured = catalog.find(({ slug }) => slug === freeGameSlug)
	if (!featured) throw new Error('Today’s featured puzzle is not registered')
	const title = t('home.metaTitle')
	const description = t('home.metaDescription')
	return {
		locale,
		dayKey,
		catalog,
		featured,
		servedAt: now.getTime(),
		resetAt: nextProductDayStart(now).getTime(),
		puzzleNumber: getPuzzleNumber(freeGameSlug, now),
		tomorrow: catalog.find(({ slug }) => slug === getTomorrowsFreeGame(now))?.name ?? '',
		season: seasonForInstant(now),
		fallbackOrder: deriveHomeExposure({
			modules: catalog,
			freeGameSlug,
			completions: {},
			dayKey,
			limit: catalog.length,
		}).slugs,
		shell: siteShellData(locale, '/', t, now),
		meta: pageMetadata({
			locale,
			title,
			description,
			baseUrl,
			imagePath: ogImagePath({
				title,
				subtitle: t('home.hero.guestTitle'),
				eyebrow: t('home.hero.ogEyebrow'),
				badge: t('home.hero.ogBadge'),
			}),
		}),
		schemas: homeOfferSchemas(locale, baseUrl),
		faqs: HOME_FAQ_KEYS.map((key) => ({
			question: t(`home.faq.${key}.question`),
			answer: t(`home.faq.${key}.answer`),
			answerLink: key === 'streak' ? { href: '/games', label: t('home.lineup.seeAll') } : undefined,
		})),
	}
}

export async function readHomeFacts(request: Request, dayKey: string) {
	const hasIdentity = hasProgressCookie(request.headers)
	const hasSession = hasAccountSessionCookie(request.headers)
	const publicTransport = requestConnectTransport()
	const viewerTransport = requestConnectTransport(request.headers)
	const now = new Date()
	const [member, daily, streak, playerCount, subscription, notices] = await Promise.all([
		hasSession ? withPresentationDeadline(requestUser(request).then(Boolean), false) : false,
		hasIdentity
			? withPresentationDeadline(
					createClient(PuzzleService, viewerTransport).getTodayProgress({
						gameSlugs: getAllGameMetadata().map((game) => game.slug),
					}),
					null,
				)
			: null,
		hasIdentity
			? withPresentationDeadline(
					createClient(GamificationService, viewerTransport)
						.getStreakInfo({})
						.then((result) => projectStreakInfo(result.info)),
					null,
				)
			: null,
		withPresentationDeadline(
			createClient(StatsService, publicTransport)
				.getTodayOverview({})
				.then((result) => result.playerCount),
			null,
		),
		hasSession
			? withPresentationDeadline(requestBilling(request.headers).subscription(), null)
			: null,
		withPresentationDeadline(getServerActiveAnnouncements(), []),
	])
	const picks = claimedDailyPicks(daily, dayKey)
	const results: Record<string, HomePersonalResult> =
		daily?.dayKey === dayKey
			? Object.fromEntries(
					Object.entries(mapTodayProgress(daily)).map(([slug, game]) => [
						slug,
						{ ...game, statusAvailable: true },
					]),
				)
			: {}
	const dismissed = parseCookie(request.headers.get('cookie') ?? '')[DISMISSED_COOKIE]
	const playedDays = streak?.playedDays ?? 0
	// Neither a guest nor an unreadable subscription can be shown a paid offer.
	const milestone =
		member && subscription?.salesOpen && !subscription.entitled && productDayKey() === dayKey
			? dueMilestone(playedDays, seenMilestones(dismissed))
			: null
	return {
		member,
		milestone: milestone === null ? null : { day: milestone, playedDays },
		hasIdentity,
		results,
		playerCount,
		freePicks: picks ? dailyPickCount(picks) : hasIdentity ? undefined : 0,
		unlimited: member && subscription?.entitled === true,
		trialEndsMs: member && subscription?.entitled ? Number(subscription.trialEndsMs) || null : null,
		streak: productDayKey(now) === dayKey && productDayKey() === dayKey ? streak : null,
		notices: visibleAnnouncements(
			notices,
			parseCookie(request.headers.get('cookie') ?? '')[DISMISSED_COOKIE],
			now.getTime(),
		),
	}
}

export type HomeDocument = ReturnType<typeof homeDocument>
export type HomeFacts = Awaited<ReturnType<typeof readHomeFacts>>
