/**
 * Game page resolution (presentation layer).
 *
 * A module page is only reachable through the registry: `resolveGamePage`
 * canonicalises inbound aliases and returns `null` for anything unregistered.
 * Route presenters translate that result to an HTTP 404 during route
 * resolution, before any content is rendered.
 */

import { type GameMetadata, type GameSlug, getGameMetadata } from '@/games/registry'

import { gameSlugFromPage } from '@/lib/game-slug'

export type ResolvedGamePage = {
	/** Canonical registry slug: inbound aliases resolve to their module. */
	slug: GameSlug
	metadata: GameMetadata
}

export function resolveGamePage(slug: string): ResolvedGamePage | null {
	const metadata = getGameMetadata(gameSlugFromPage(slug))
	if (!metadata) return null
	// The registry maps the canonical slug to this config, so the config's own
	// slug is the registered key.
	return { slug: metadata.slug as GameSlug, metadata }
}

export type GameFaqItem = {
	question: string
	answer: string
}

/**
 * Per-module FAQ copy. Malformed or blank entries are dropped rather than
 * rendered as an empty question, so a copy mistake can never ship a hollow
 * heading into the FAQPage structured data.
 */
export function parseGameFaq(raw: unknown): GameFaqItem[] {
	if (!Array.isArray(raw)) return []
	return raw.flatMap((entry) => {
		if (!entry || typeof entry !== 'object') return []
		const { question, answer } = entry as { question?: unknown; answer?: unknown }
		if (typeof question !== 'string' || typeof answer !== 'string') return []
		const trimmedQuestion = question.trim()
		const trimmedAnswer = answer.trim()
		if (!trimmedQuestion || !trimmedAnswer) return []
		return [{ question: trimmedQuestion, answer: trimmedAnswer }]
	})
}

/** Per-module strategy tips; blank entries are dropped. */
export function parseGameTips(raw: unknown): string[] {
	if (!Array.isArray(raw)) return []
	return raw.flatMap((entry) => {
		if (typeof entry !== 'string') return []
		const tip = entry.trim()
		return tip ? [tip] : []
	})
}

/**
 * HowTo structured data from the rules a game page already shows, so the
 * machine-readable steps are the visible steps. No answer, no puzzle content:
 * only the module's own rule statements.
 */
export function howToStructuredData(name: string, rules: readonly string[]) {
	return {
		'@context': 'https://schema.org',
		'@type': 'HowTo',
		name,
		step: rules.map((text, index) => ({
			'@type': 'HowToStep',
			position: index + 1,
			text,
		})),
	}
}
