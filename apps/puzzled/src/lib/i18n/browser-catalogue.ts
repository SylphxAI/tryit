import { messages as englishHome } from './catalogues/en-US-home'
import { defaultLocale, type Locale } from './config'
import {
	gameCopyFallbackChain,
	type LocaleCatalogue,
	type Messages,
	resolveMessages,
} from './resolve-messages'

const loaders = {
	'en-US': () => import('./catalogues/en-US'),
	'en-GB': () => import('./catalogues/en-GB'),
	'zh-HK': () => import('./catalogues/zh-HK'),
	'zh-TW': () => import('./catalogues/zh-TW'),
	'zh-CN': () => import('./catalogues/zh-CN'),
	ja: () => import('./catalogues/ja'),
	es: () => import('./catalogues/es'),
	'pt-BR': () => import('./catalogues/pt-BR'),
} satisfies Record<Locale, () => Promise<LocaleCatalogue>>

const extendedLoaders = {
	'en-US': () => import('./catalogues/en-US-extended'),
	'en-GB': () => import('./catalogues/en-GB-extended'),
	'zh-HK': () => import('./catalogues/zh-HK-extended'),
	'zh-TW': () => import('./catalogues/zh-TW-extended'),
	'zh-CN': () => import('./catalogues/zh-CN-extended'),
	ja: () => import('./catalogues/ja-extended'),
	es: () => import('./catalogues/es-extended'),
	'pt-BR': () => import('./catalogues/pt-BR-extended'),
} satisfies Record<Locale, () => Promise<{ messages: Messages }>>

const extended = new Map<Locale, Promise<void>>()
const core = new Map<Locale, Promise<void>>()
const homes = new Map<Locale, Promise<void>>()
const resolved = new Map<Locale, Messages>([[defaultLocale, { ...englishHome }]])

function prepare(locale: Locale, scope: 'home' | 'core'): Promise<void> {
	const pendingByLocale = scope === 'home' ? homes : core
	const pending = pendingByLocale.get(locale)
	if (pending) return pending
	const promise = (async () => {
		const entries = await Promise.all(
			gameCopyFallbackChain(locale).map(async (entry) => {
				if (scope === 'home' && entry === defaultLocale) {
					return [entry, { messages: englishHome, games: {} }] as const
				}
				return [entry, await loaders[entry]()] as const
			}),
		)
		const loaded = new Map<Locale, LocaleCatalogue>(entries)
		const messages = resolveMessages(locale, (entry) => {
			const catalogue = loaded.get(entry)
			if (!catalogue) throw new Error(`Missing catalogue dependency: ${entry}`)
			return catalogue
		})
		const current = resolved.get(locale)
		if (!current) resolved.set(locale, messages)
		// Upgrade in place: existing translators retain this object. A slow Home
		// load must never overwrite a catalogue already prepared for another route.
		else if (scope === 'core') Object.assign(current, messages)
	})().catch((error) => {
		pendingByLocale.delete(locale)
		throw error
	})
	pendingByLocale.set(locale, promise)
	return promise
}

export function prepareHomeBrowserMessages(locale: Locale): Promise<void> {
	return resolved.has(locale) ? Promise.resolve() : prepare(locale, 'home')
}

export function prepareBrowserMessages(locale: Locale): Promise<void> {
	return prepare(locale, 'core')
}

export function browserMessages(locale: Locale): Messages {
	const messages = resolved.get(locale)
	if (!messages) throw new Error(`Browser catalogue not prepared: ${locale}`)
	return messages
}

/** Load console, account and support copy before rendering any route that may use it. */
export function prepareExtendedBrowserMessages(locale: Locale): Promise<void> {
	const pending = extended.get(locale)
	if (pending) return pending
	const promise = (async () => {
		const locales = gameCopyFallbackChain(locale)
		const [entries] = await Promise.all([
			Promise.all(
				locales.map(
					async (entry) => [entry, { ...(await extendedLoaders[entry]()), games: {} }] as const,
				),
			),
			prepareBrowserMessages(locale),
		])
		const sources = new Map<Locale, LocaleCatalogue>(entries)
		const { games: _games, ...copy } = resolveMessages(locale, (entry) => {
			const catalogue = sources.get(entry)
			if (!catalogue) throw new Error('Missing extended catalogue dependency')
			return catalogue
		})
		// Existing translators close over this object. Extend it in place before
		// navigating into account/console views; do not invalidate their caches.
		Object.assign(browserMessages(locale), copy)
	})().catch((error) => {
		extended.delete(locale)
		throw error
	})
	extended.set(locale, promise)
	return promise
}

// The browser build resolves the translator directly to this catalogue.
export { browserMessages as loadMessages }
