import { type Locale, localeNames, locales } from '@/lib/i18n/config'
import type { Translate } from '@/lib/i18n/translate'
import { localizedPath } from '@/lib/seo/urls'

const tabs = [
	{ path: '/', label: 'today' },
	{ path: '/games', label: 'games' },
	{ path: '/archive', label: 'archive' },
	{ path: '/stats', label: 'stats' },
	{ path: '/profile', label: 'account' },
] as const

export function siteShellData(locale: Locale, path: string, t: Translate, now: Date) {
	return {
		home: localizedPath(locale),
		mainNav: t('nav.main'),
		privacy: { href: localizedPath(locale, '/privacy'), title: t('footer.privacy') },
		tabs: tabs.map((tab) => ({
			...tab,
			title: t(`nav.${tab.label}`),
			href: localizedPath(locale, tab.path),
			active:
				tab.path === '/' ? path === '/' : path === tab.path || path.startsWith(`${tab.path}/`),
		})),
		plus: { title: t('nav.plus'), href: localizedPath(locale, '/pricing') },
		languages: locales.map((code) => ({
			code,
			name: localeNames[code],
			href: localizedPath(code, path),
		})),
		language: locale,
		changeLanguage: t('common.changeLanguage'),
		footer: {
			tagline: t('footer.tagline'),
			resetNote: t('footer.resetNote'),
			copyright: t('footer.copyright', { year: now.getUTCFullYear() }),
			links: [
				{ path: '/games', title: t('footer.allGames') },
				{ path: '/pricing', title: t('nav.plus') },
				{ path: '/support', title: t('nav.support') },
				{ path: '/vs', title: t('footer.allComparisons') },
				{ path: '/privacy', title: t('footer.privacy') },
				{ path: '/terms', title: t('footer.terms') },
				{ path: '/delete-account', title: t('footer.deleteAccount') },
			].map((link) => ({ ...link, href: localizedPath(locale, link.path) })),
		},
	}
}

export type SiteShellData = ReturnType<typeof siteShellData>
