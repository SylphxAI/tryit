import { create } from '@bufbuild/protobuf'
import { createClient } from '@connectrpc/connect'
import {
	explicitChallengeGame,
	landingPlayTarget,
	parseShareId,
	sharedPlayHref,
	sharedResultCard,
	toSharedResult,
} from '@/features/daily/lib/challenge'
import { dailyEntryTarget, shareQuery } from '@/features/daily/lib/daily-entry'
import { resolveModuleDisplayName } from '@/features/daily/lib/result-share'
import { getGameMetadata } from '@/games/registry'
import { GetSharedResultRequestSchema, PuzzleService } from '@/gen/connect/puzzled/v1/puzzle_pb'
import { requestConnectTransport } from '@/lib/api/request-connect'
import { getTodaysFreeGame } from '@/lib/free-rotation'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { productDayKey } from '@/lib/product-day'
import { ogImagePath, pageMetadata } from '@/lib/seo/page-metadata'
import { localizedPath } from '@/lib/seo/urls'
import { canonicalSiteOrigin } from '@/lib/site-origin-request'
import { siteShellData } from '@/shared/solid/site-shell-data'

async function readSharedResult(shareId: string) {
	try {
		// Public data: never forward the visitor's session or guest cookie.
		const client = createClient(PuzzleService, requestConnectTransport())
		return toSharedResult(
			await client.getSharedResult(create(GetSharedResultRequestSchema, { shareId })),
		)
	} catch {
		return null
	}
}

export async function readShareLanding(
	locale: Locale,
	shareSegment: string | null,
	search: string,
	request: Request,
	now = new Date(),
) {
	if (shareSegment === null) {
		const location = dailyEntryTarget(locale, search, now)
		if (location) return { kind: 'redirect', location } as const
	}
	const query = shareQuery(new URLSearchParams(search))
	const fallbackGame = explicitChallengeGame(query)
	const today = { dayKey: productDayKey(now), freeGameSlug: getTodaysFreeGame(now) }
	const rawShareId = (shareSegment ?? query.ref ?? '').trim()
	const shareId = parseShareId(rawShareId)
	const shared = shareId ? await readSharedResult(shareId) : null
	const target = shared
		? landingPlayTarget(shared, today)
		: { gameSlug: fallbackGame ?? today.freeGameSlug, sameAsShared: false }
	const origin = canonicalSiteOrigin(request.headers)
	const t = createTranslator(locale)
	const gameName = (slug: string) =>
		resolveModuleDisplayName(
			Object.assign((key: string) => t(`games.${key}`), {
				has: (key: string) => t.has(`games.${key}`),
			}),
			slug,
		)
	const playName = gameName(target.gameSlug)
	const metadataGame = shared?.gameSlug ?? fallbackGame
	const title = metadataGame
		? t('share.landing.ogTitle', { game: gameName(metadataGame) })
		: t('share.landing.metaTitle')
	const description = t('share.landing.metaDescription')
	const status = shared
		? t(shared.status === 'won' ? 'share.card.statusWon' : 'share.card.statusLost')
		: null
	const metric =
		shared?.score != null
			? t('share.card.scorePoints', { score: shared.score })
			: shared?.attempts != null
				? t('share.card.attemptsCount', { attempts: shared.attempts })
				: null
	const path = shareSegment === null ? '/daily' : `/r/${encodeURIComponent(shareSegment)}`
	return {
		kind: 'page',
		page: {
			locale,
			shell: siteShellData(locale, path, t, now),
			meta: pageMetadata({
				locale,
				path,
				title,
				description,
				baseUrl: origin,
				noindex: true,
				withAlternates: false,
				imagePath: ogImagePath({
					title,
					subtitle: status ? (metric ? `${status} · ${metric}` : status) : description,
					eyebrow: t('share.landing.eyebrow'),
					badge: shared?.streak ? t('share.card.streakDays', { days: shared.streak }) : undefined,
					theme: metadataGame ? getGameMetadata(metadataGame)?.display.theme : undefined,
				}),
			}),
			card: shared
				? sharedResultCard(shared, {
						origin,
						gameName: playName,
						theme: getGameMetadata(target.gameSlug)?.display.theme ?? 'slate',
						locale,
					})
				: null,
			shareId,
			memory:
				shared && target.sameAsShared && shareId
					? { shareId, gameSlug: target.gameSlug, dayKey: shared.dayKey }
					: null,
			sameAsShared: target.sameAsShared,
			playName,
			playHref: localizedPath(
				locale,
				sharedPlayHref({
					gameSlug: target.gameSlug,
					shareId: shared ? shareId : rawShareId,
					utmSource: query.utm_source,
				}),
			),
		},
	} as const
}
