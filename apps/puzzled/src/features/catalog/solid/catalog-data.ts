import {
	buildCatalogEntries,
	CATALOG_CATEGORIES,
	type CatalogCategoryFilter,
	readMessage,
} from '@/features/catalog/lib/catalog'
import { getAllGameMetadata } from '@/games/registry'
import { getTodaysFreeGame } from '@/lib/free-rotation'
import type { Locale } from '@/lib/i18n/config'
import { createTranslator } from '@/lib/i18n/translate'
import { ogImagePath, pageMetadata } from '@/lib/seo/page-metadata'
import { localizedPath } from '@/lib/seo/urls'
import { siteShellData } from '@/shared/solid/site-shell-data'

const FAQ_KEYS = ['start', 'rotation', 'account', 'share'] as const

export function buildCatalogPage(locale: Locale, origin: string, now: Date) {
	const t = createTranslator(locale)
	const shell = siteShellData(locale, '/games', t, now)
	const path = localizedPath(locale, '/games')
	const entries = buildCatalogEntries({
		modules: getAllGameMetadata(),
		freeGameSlug: getTodaysFreeGame(now),
	}).map((entry) => ({
		slug: entry.slug,
		theme: entry.theme,
		duration: t('common.estimatedPlayTime', { minutes: entry.durationMinutes }),
		category: entry.category,
		categoryLabel: t(`catalog.category.${entry.category}`),
		freeToday: entry.freeToday,
		title: readMessage(t, entry.titleKey, entry.canonicalTitle),
		tagline: readMessage(t, entry.taglineKey, ''),
		href: localizedPath(locale, `/games/${entry.slug}`),
	}))
	const title = t('catalog.metaTitle')
	const description = t('catalog.metaDescription')
	const eyebrow = t('catalog.heroEyebrow')
	const filters: { value: CatalogCategoryFilter; label: string }[] = [
		{ value: 'all', label: t('catalog.filterAll') },
		...CATALOG_CATEGORIES.map((value) => ({ value, label: t(`catalog.category.${value}`) })),
	]
	const faqs = FAQ_KEYS.map((key) => ({
		question: t(`catalog.faq.${key}.question`),
		answer: t(`catalog.faq.${key}.answer`),
	}))

	return {
		entries,
		filters,
		faqs,
		path,
		shell,
		meta: pageMetadata({
			locale,
			path: '/games',
			title,
			description,
			baseUrl: origin,
			imagePath: ogImagePath({ title, subtitle: description, eyebrow }),
		}),
		labels: {
			title: t('catalog.title'),
			subtitle: t('catalog.subtitle', { count: entries.length }),
			eyebrow,
			searchLabel: t('catalog.searchLabel'),
			searchPlaceholder: t('catalog.searchPlaceholder'),
			searchSubmit: t('catalog.searchSubmit'),
			filterLabel: t('catalog.filterLabel'),
			clearFilter: t('catalog.clearFilter'),
			suiteTitle: t('catalog.suiteTitle'),
			emptyTitle: t('catalog.emptyTitle'),
			emptyDescription: t('catalog.emptyDescription'),
			play: t('catalog.play'),
			freeToday: t('catalog.freeToday'),
			faqTitle: t('catalog.faq.title'),
			faqBody: t('catalog.faq.body'),
		},
		counts: Array.from({ length: entries.length + 1 }, (_, count) =>
			t('catalog.showing', { count, total: entries.length }),
		),
		itemList: {
			'@context': 'https://schema.org',
			'@type': 'ItemList',
			name: title,
			numberOfItems: entries.length,
			itemListElement: entries.map((entry, index) => ({
				'@type': 'ListItem',
				position: index + 1,
				name: entry.title,
				url: origin + entry.href,
			})),
		},
		faqSchema: {
			'@context': 'https://schema.org',
			'@type': 'FAQPage',
			mainEntity: faqs.map((faq) => ({
				'@type': 'Question',
				name: faq.question,
				acceptedAnswer: { '@type': 'Answer', text: faq.answer },
			})),
		},
	}
}

export type CatalogPageData = ReturnType<typeof buildCatalogPage>
