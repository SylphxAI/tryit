import { defaultLocale, type Locale, localeFallbacks } from './config'

export type Messages = Record<string, unknown>
export type GameCopy = Messages
export type GameMessages = Record<string, GameCopy>
export type LocaleCatalogue = { messages: Messages; games: GameMessages }

/** Deep merge where `source` wins; arrays and scalars are replaced, not merged. */
function deepMerge(target: GameCopy, source: GameCopy): GameCopy {
	const merged: GameCopy = { ...target }

	for (const [key, value] of Object.entries(source)) {
		const current = merged[key]
		const bothObjects =
			value !== null &&
			typeof value === 'object' &&
			!Array.isArray(value) &&
			current !== null &&
			typeof current === 'object' &&
			!Array.isArray(current)

		merged[key] = bothObjects ? deepMerge(current as GameCopy, value as GameCopy) : value
	}

	return merged
}

/**
 * Base-first locale chain: the declared fallback chain, always ending at
 * English. `zh-TW` therefore reads `en` -> `zh-HK` -> `zh-TW`.
 */
export function gameCopyFallbackChain(locale: Locale): Locale[] {
	const chain: Locale[] = [locale]
	let current: Locale | null = localeFallbacks[locale]

	while (current) {
		chain.unshift(current)
		current = localeFallbacks[current]
	}

	if (chain[0] !== defaultLocale) chain.unshift(defaultLocale)

	return chain
}

/**
 * Resolve the `games` namespace for one locale.
 *
 * English defines the module set and every key; each overlay on the locale's
 * fallback chain layers on top of it, so a partial translation shows translated
 * values where it has them and English everywhere else.
 */
export function mergeGameMessages(
	locale: Locale,
	english: GameMessages,
	overlays: Partial<Record<Locale, GameMessages>>,
): GameMessages {
	const resolved: GameMessages = { ...english }

	for (const chainLocale of gameCopyFallbackChain(locale)) {
		const overlay = overlays[chainLocale]
		if (!overlay) continue

		for (const [gameKey, patch] of Object.entries(overlay)) {
			const base = resolved[gameKey]
			if (!base) continue
			resolved[gameKey] = deepMerge(base, patch)
		}
	}

	return resolved
}

/** Build the same catalogue on the server and in the browser. */
export function resolveMessages(
	locale: Locale,
	getCatalogue: (locale: Locale) => LocaleCatalogue,
): Messages {
	const fallback = localeFallbacks[locale]
	const messages = deepMerge(
		fallback ? getCatalogue(fallback).messages : {},
		getCatalogue(locale).messages,
	)
	const overlays: Partial<Record<Locale, GameMessages>> = {}
	for (const entry of gameCopyFallbackChain(locale)) {
		if (entry !== defaultLocale) overlays[entry] = getCatalogue(entry).games
	}
	messages.games = mergeGameMessages(locale, getCatalogue(defaultLocale).games, overlays)
	return messages
}
