/**
 * Non-spoiler result card model (S3 slice 2 - closes register row G3).
 *
 * Protocol: docs/game-protocol.md, "Result card"
 * "Result card (viral unit)". The model is the one place the non-spoiler
 * invariants live:
 *
 * - No solution string, no answer grid, no free-form game content: every field
 *   is an enum, a bounded number, a product day key, a pattern of typed tiles
 *   (hit / near / miss) or a deep link derived from the module slug.
 * - buildResultCard copies fields one by one, so anything extra a caller passes
 *   (the result surface holds the solution in a sibling prop) is dropped.
 * - Glanceable fields only: attempts / score / streak / time band / pattern.
 * - Day and module are always labelled; the deep link reuses share-text.ts so
 *   the archive contract stays single-sourced (G1).
 */

import { seasonForDayKey } from '@/features/seasons/lib/seasons'
import type { GameColorTheme } from '@/games/theme-colors'
import { isValidDayKey } from '@/lib/product-day'
import { normalizePattern, type ResultCardTile } from './result-card-pattern'
import { ritualShareDeepLink } from './share-text'

export type ResultCardStatus = 'won' | 'lost'

/** Which ritual the run belongs to. */
export type ResultCardMode = 'daily' | 'archive'

/** Coarse time bucket; the exact duration stays out of the shared image. */
export type ResultCardTimeBand = 'under1m' | 'under5m' | 'over5m'

export interface ResultCardInput {
	origin: string
	gameSlug: string
	gameName: string
	theme: GameColorTheme
	mode: ResultCardMode
	status: ResultCardStatus
	/** Viewer locale, for the day label only. Defaults to en. */
	locale?: string
	/** YYYY-MM-DD product day the run was served for, when known. */
	puzzleDate?: string | null
	/** Current product day from the server-rendered view. */
	todayKey?: string
	attempts?: number | null
	maxAttempts?: number | null
	mistakes?: number | null
	hintsUsed?: number | null
	score?: number | null
	timeSpentMs?: number | null
	currentStreak?: number | null
	pattern?: readonly (readonly ResultCardTile[])[] | null
	/** Server-issued share id; makes the card's link the share landing. */
	shareId?: string | null
}

export interface ResultCardModel {
	gameSlug: string
	gameName: string
	theme: GameColorTheme
	mode: ResultCardMode
	status: ResultCardStatus
	dayKey: string | null
	/** Day rendered for the viewer, e.g. Sep 21, 2026; null without a day. */
	dayDisplay: string | null
	/** Linkifiable share URL: https://tryit.fun/r/<id>?utm_source=share, else https://tryit.fun/games/<slug>?[mode=archive&date=...&]utm_source=share. */
	deepLink: string
	attempts: number | null
	maxAttempts: number | null
	mistakes: number | null
	hintsUsed: number | null
	score: number | null
	timeBand: ResultCardTimeBand | null
	currentStreak: number | null
	pattern: ResultCardTile[][] | null
	/**
	 * Presentation-only seasonal theme, set only when the card's day is a
	 * seasonal day (features/seasons). Carries no puzzle content.
	 */
	season: { id: string; accent: GameColorTheme; glyph: string } | null
}

function nonNegativeInt(value: number | null | undefined): number | null {
	if (value == null || !Number.isFinite(value)) return null
	const n = Math.floor(value)
	return n >= 0 ? n : null
}

/** Coarse band for a duration; null when unmeasured or not positive. */
export function resultCardTimeBand(
	timeSpentMs: number | null | undefined,
): ResultCardTimeBand | null {
	if (timeSpentMs == null || !Number.isFinite(timeSpentMs) || timeSpentMs <= 0) return null
	if (timeSpentMs < 60_000) return 'under1m'
	if (timeSpentMs < 300_000) return 'under5m'
	return 'over5m'
}

/** Format a product day key for display; zone-stable across viewers. */
export function formatCardDayKey(dayKey: string, locale: string): string {
	const parts = dayKey.split('-')
	const date = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])))
	return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(date)
}

/**
 * Build the card model from a finished run.
 *
 * Field-by-field by design: an answer string riding along in the input (the
 * result surfaces keep it in a sibling prop) can never reach the model, the
 * image or the text alternative.
 */
export function buildResultCard(input: ResultCardInput): ResultCardModel {
	const dayKey = isValidDayKey(input.puzzleDate) ? String(input.puzzleDate).trim() : null
	const streak = nonNegativeInt(input.currentStreak)
	return {
		gameSlug: String(input.gameSlug).trim(),
		gameName: String(input.gameName).trim(),
		theme: input.theme,
		mode: input.mode === 'archive' ? 'archive' : 'daily',
		status: input.status === 'won' ? 'won' : 'lost',
		dayKey,
		dayDisplay: dayKey ? formatCardDayKey(dayKey, input.locale || 'en') : null,
		deepLink: ritualShareDeepLink(
			input.origin,
			input.gameSlug,
			dayKey || undefined,
			input.shareId ?? undefined,
			input.todayKey,
		),
		attempts: nonNegativeInt(input.attempts),
		maxAttempts: nonNegativeInt(input.maxAttempts),
		mistakes: nonNegativeInt(input.mistakes),
		hintsUsed: nonNegativeInt(input.hintsUsed),
		score: nonNegativeInt(input.score),
		timeBand: resultCardTimeBand(input.timeSpentMs),
		currentStreak: streak && streak > 0 ? streak : null,
		pattern: normalizePattern(input.pattern),
		season: seasonOf(dayKey),
	}
}

function seasonOf(dayKey: string | null): ResultCardModel['season'] {
	const season = seasonForDayKey(dayKey)
	return season ? { id: season.id, accent: season.accent, glyph: season.glyph } : null
}
