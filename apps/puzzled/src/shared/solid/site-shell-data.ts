import { type Locale, localeNames, localeShortNames, locales } from '@/lib/i18n/config'
import type { Translate } from '@/lib/i18n/translate'
import { localizedPath } from '@/lib/seo/urls'

const tabs = [
	{ path: '/', label: 'today' },
	{ path: '/games', label: 'games' },
	{ path: '/archive', label: 'archive' },
	{ path: '/stats', label: 'stats' },
	{ path: '/profile', label: 'account' },
] as const

export function consentCopy(locale: Locale, t: Translate) {
	return {
		privacyHref: localizedPath(locale, '/privacy'),
		title: t('consent.title'),
		message: t('consent.message'),
		learnMore: t('consent.learnMore'),
		accept: t('consent.accept'),
		decline: t('consent.decline'),
		change: t('consent.change'),
		close: t('consent.close'),
		gpc: t('consent.gpc'),
		enabled: t('consent.enabled'),
		disabled: t('consent.disabled'),
	}
}

export function siteShellData(locale: Locale, path: string, t: Translate, now: Date) {
	return {
		home: localizedPath(locale),
		mainNav: t('nav.main'),
		consent: consentCopy(locale, t),
		tabs: tabs.map((tab) => ({
			...tab,
			title: t(`nav.${tab.label}`),
			href: localizedPath(locale, tab.path),
			active:
				tab.path === '/' ? path === '/' : path === tab.path || path.startsWith(`${tab.path}/`),
		})),
		plus: { title: t('nav.plus'), href: localizedPath(locale, '/pricing') },
		signIn: { title: t('common.signIn'), href: localizedPath(locale, '/profile') },
		languages: locales.map((code) => ({
			code,
			name: localeNames[code],
			href: localizedPath(code, path),
		})),
		language: locale,
		languageName: localeNames[locale],
		languageShortName: localeShortNames[locale],
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
