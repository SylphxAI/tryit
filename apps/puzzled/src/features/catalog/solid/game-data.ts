import { readMessage, relatedCatalogSlugs } from '@/features/catalog/lib/catalog'
import { gameMetaDescription, gameMetaTitle } from '@/features/catalog/lib/game-meta'
import {
	howToStructuredData,
	parseGameFaq,
	parseGameTips,
	resolveGamePage,
} from '@/features/catalog/lib/game-page'
import { DAILY_FREE_PICKS } from '@/features/daily/lib/daily-picks'
import { getAllGameMetadata } from '@/games/registry'
import { getTodaysFreeGame } from '@/lib/free-rotation'
import { canonicalizeGameSlug, gamePath, slugToCamelCase } from '@/lib/game-slug'
import type { Locale } from '@/lib/i18n/config'
import { difficultyLabelKey } from '@/lib/i18n/difficulty'
import { createTranslator } from '@/lib/i18n/translate'
import { ogImagePath, pageMetadata } from '@/lib/seo/page-metadata'
import { localizedPath } from '@/lib/seo/urls'
import { isLoopbackHostname, PRODUCTION_SITE_ORIGIN } from '@/lib/site-origin'
import { siteShellData } from '@/shared/solid/site-shell-data'
import { buildCatalogPage } from './catalog-data'

export function buildGamePage(locale: Locale, slug: string, origin: string, now: Date) {
	const game = resolveGamePage(slug)
	if (!game) return null
	const { metadata } = game
	const t = createTranslator(locale)
	const gameKey = `games.${slugToCamelCase(game.slug)}`
	const name = readMessage(t, `${gameKey}.name`, metadata.name)
	const description = readMessage(t, `${gameKey}.description`, metadata.description)
	const tagline = readMessage(t, `${gameKey}.tagline`, '')
	const category = t(`catalog.category.${metadata.category}`)
	const tc = (key: string, vars?: Parameters<typeof t>[1]) => t(`catalog.${key}`, vars)
	const path = gamePath(game.slug)
	const home = localizedPath(locale)
	const catalog = localizedPath(locale, '/games')
	const canonicalPath = localizedPath(locale, path)
	const rulesSource = t.raw(`${gameKey}.rules`)
	const rules =
		rulesSource && typeof rulesSource === 'object'
			? Object.entries(rulesSource).flatMap(([key, value]) =>
					key !== 'title' && typeof value === 'string' && value.trim() ? [value] : [],
				)
			: []
	const tips = parseGameTips(t.raw(`catalog.game.${game.slug}.tips`))
	const all = getAllGameMetadata()
	const freeAccess = { game: name, count: DAILY_FREE_PICKS, total: all.length }
	const faq = [
		...parseGameFaq(t.raw(`catalog.game.${game.slug}.faq`)),
		{
			question: tc('gamePage.freeAccessFaq.question', freeAccess),
			answer: tc('gamePage.freeAccessFaq.answer', freeAccess),
		},
	]
	const tiles = buildCatalogPage(locale, origin, now)
	const related = relatedCatalogSlugs({ slug: game.slug, modules: all }).flatMap(
		(other) => tiles.entries.find((entry) => entry.slug === other) ?? [],
	)
	const rulesTitle = tc('gamePage.howToPlayTitle', { game: name })
	// Share cards must remain fetchable outside a local browser.
	const imageOrigin = isLoopbackHostname(new URL(origin).hostname) ? PRODUCTION_SITE_ORIGIN : origin
	const meta = pageMetadata({
		locale,
		path,
		baseUrl: origin,
		title: gameMetaTitle(tc, name, metadata.category),
		description: gameMetaDescription(
			tc,
			name,
			metadata.category,
			description,
			locale.startsWith('zh') ? '。' : '.',
		),
		imagePath:
			imageOrigin +
			ogImagePath({
				title: name,
				subtitle: tagline,
				eyebrow: category,
				theme: metadata.display.theme,
			}),
	})
	const schema = [
		{
			'@context': 'https://schema.org',
			'@graph': [
				{
					'@type': 'BreadcrumbList',
					itemListElement: [
						{ name: t('nav.home'), href: home },
						{ name: tc('title'), href: catalog },
						{ name, href: canonicalPath },
					].map(({ name, href }, i) => ({
						'@type': 'ListItem',
						position: i + 1,
						name,
						item: origin + href,
					})),
				},
				{
					'@type': 'VideoGame',
					name,
					description,
					genre: category,
					playMode: 'SinglePlayer',
					publisher: { '@type': 'Organization', name: 'Tryit' },
					url: origin + canonicalPath,
					inLanguage: locale,
					isAccessibleForFree: true,
					image: meta.openGraph.images[0].url,
					offers: {
						'@type': 'Offer',
						price: '0',
						priceCurrency: 'USD',
						availability: 'https://schema.org/InStock',
					},
					gamePlatform: 'Web browser',
					operatingSystem: 'Any',
					applicationCategory: 'Game',
				},
			],
		},
		...(rules.length ? [howToStructuredData(rulesTitle, rules)] : []),
		{
			'@context': 'https://schema.org',
			'@type': 'FAQPage',
			mainEntity: faq.map(({ question, answer }) => ({
				'@type': 'Question',
				name: question,
				acceptedAnswer: { '@type': 'Answer', text: answer },
			})),
		},
	]
	return {
		locale,
		slug: game.slug,
		name,
		description,
		category,
		home,
		catalog,
		canonicalPath,
		theme: metadata.display.theme,
		duration: t('common.estimatedPlayTime', { minutes: metadata.display.durationMinutes }),
		highlight: readMessage(t, `${gameKey}.highlight`, ''),
		difficultyLevels: metadata.supportsDifficulty
			? (metadata.difficultyLevels ?? []).map(({ level }) => ({
					level,
					label: t(difficultyLabelKey(level)),
					description: readMessage(
						t,
						`${gameKey}.difficultyDescriptions.${level}`,
						t(`common.difficulty.${level}Description`),
					),
				}))
			: [],
		featured: game.slug === canonicalizeGameSlug(getTodaysFreeGame(now)),
		shell: siteShellData(locale, path, t, now),
		meta,
		labels: {
			breadcrumb: tc('breadcrumbLabel'),
			home: t('nav.home'),
			catalog: tc('title'),
			play: tc('gamePage.playCta'),
			featured: tc('freeToday'),
			guest: tc('gamePage.guestNote'),
			signup: tc('gamePage.guestSignIn'),
			rulesTitle,
			tipsTitle: tc('gamePage.tipsTitle', { game: name }),
			faqTitle: tc('gamePage.faqTitle', { game: name }),
			relatedTitle: tc('gamePage.relatedTitle'),
			relatedAll: tc('gamePage.relatedAll'),
		},
		rules,
		tips,
		faq,
		related,
		tileLabels: tiles.labels,
		schema,
	}
}

export type GamePageData = NonNullable<ReturnType<typeof buildGamePage>>
