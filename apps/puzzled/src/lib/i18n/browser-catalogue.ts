import * as english from './catalogues/en-US'
import { defaultLocale, type Locale } from './config'
import {
	gameCopyFallbackChain,
	type LocaleCatalogue,
	type Messages,
	resolveMessages,
} from './resolve-messages'

const loaders = {
	'en-GB': () => import('./catalogues/en-GB'),
	'zh-HK': () => import('./catalogues/zh-HK'),
	'zh-TW': () => import('./catalogues/zh-TW'),
	'zh-CN': () => import('./catalogues/zh-CN'),
	ja: () => import('./catalogues/ja'),
	es: () => import('./catalogues/es'),
	'pt-BR': () => import('./catalogues/pt-BR'),
} satisfies Record<Exclude<Locale, typeof defaultLocale>, () => Promise<LocaleCatalogue>>

const resolved = new Map<Locale, Messages>()

export async function prepareBrowserMessages(locale: Locale): Promise<void> {
	if (locale === defaultLocale || resolved.has(locale)) return
	const entries = await Promise.all(
		gameCopyFallbackChain(locale).map(async (entry) => {
			if (entry === 'en-US') return [entry, english] as const
			return [entry, await loaders[entry]()] as const
		}),
	)
	const loaded = new Map<Locale, LocaleCatalogue>(entries)
	resolved.set(
		locale,
		resolveMessages(locale, (entry) => {
			const catalogue = loaded.get(entry)
			if (!catalogue) throw new Error(`Missing catalogue dependency: ${entry}`)
			return catalogue
		}),
	)
}

export function browserMessages(locale: Locale): Messages {
	let messages = resolved.get(locale)
	if (!messages) {
		if (locale !== defaultLocale) throw new Error(`Browser catalogue not prepared: ${locale}`)
		messages = resolveMessages(locale, () => english)
		resolved.set(locale, messages)
	}
	return messages
}
