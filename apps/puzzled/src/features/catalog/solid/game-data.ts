import { readMessage, relatedCatalogSlugs } from '@/features/catalog/lib/catalog'
import { gameMetaDescription, gameMetaTitle } from '@/features/catalog/lib/game-meta'
import {
	howToStructuredData,
	parseGameFaq,
	parseGameTips,
	resolveGamePage,
} from '@/features/catalog/lib/game-page'
import { getAllGameMetadata } from '@/games/registry'
import { getTodaysFreeGame } from '@/lib/free-rotation'
import { canonicalizeGameSlug, slugToCamelCase } from '@/lib/game-slug'
import type { Locale } from '@/lib/i18n/config'
import { difficultyLabelKey } from '@/lib/i18n/difficulty'
import { createTranslator } from '@/lib/i18n/translate'
import { ogImagePath, pageMetadata } from '@/lib/seo/page-metadata'
import { localizedPath } from '@/lib/seo/urls'
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
	const tc = (key: string, vars?: Record<string, string>) => t(`catalog.${key}`, vars)
	const path = `/games/${game.slug}`
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
	const faq = parseGameFaq(t.raw(`catalog.game.${game.slug}.faq`))
	const all = getAllGameMetadata()
	const tiles = buildCatalogPage(locale, origin, now)
	const related = relatedCatalogSlugs({ slug: game.slug, modules: all }).flatMap(
		(other) => tiles.entries.find((entry) => entry.slug === other) ?? [],
	)
	const rulesTitle = tc('gamePage.howToPlayTitle', { game: name })
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
				},
			],
		},
		...(rules.length ? [howToStructuredData(rulesTitle, rules)] : []),
		...(faq.length
			? [
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
			: []),
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
		duration: metadata.display.duration,
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
		meta: pageMetadata({
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
			imagePath: ogImagePath({
				title: name,
				subtitle: tagline,
				eyebrow: category,
				theme: metadata.display.theme,
			}),
		}),
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
