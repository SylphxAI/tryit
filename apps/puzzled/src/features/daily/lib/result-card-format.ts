import { MAX_MISTAKES, TOTAL_CATEGORIES } from '@/games/word-groups/types'
import type { ResultCardModel } from './result-card-model'
import type { ResultCardTile } from './result-card-pattern'

/** Resolved card copy; all values come from messages/<locale>/share.json card.*. */
export interface ResultCardStrings {
	statusWon: string
	statusLost: string
	attemptsLabel: string
	scoreLabel: string
	streakLabel: string
	timeLabel: string
	mistakesLabel: string
	groupsSolvedLabel: string
	groupsSolvedCount: string
	mistakeCount: string
	timeUnder1m: string
	timeUnder5m: string
	timeOver5m: string
	attemptsOf: string
	attemptsCount: string
	scorePoints: string
	streakDays: string
	patternSummary: string
	altOnDay: string
	altTemplate: string
	altDetailsTemplate: string
	altLinkTemplate: string
	detailSeparator: string
	/** The seasonal greeting; null on every non-seasonal day. */
	seasonGreeting?: string | null
}

export interface ResultCardChip {
	label: string
	value: string
}

/** The server counts strictly worse finishes (including losses), not speed alone. */
export function resultPercentileLabel(
	percentile: number | undefined,
	locale: string,
	format: (percent: string) => string,
): string | null {
	if (percentile === undefined) return null
	return format(new Intl.NumberFormat(locale, { style: 'percent' }).format(percentile / 100))
}

/** Replace {name} tokens; unknown tokens are left untouched. */
function fillCardTemplate(template: string, values: Record<string, string | number>): string {
	return template.replace(/\{(\w+)\}/g, (match: string, key: string) => {
		const value = values[key]
		return value === undefined ? match : String(value)
	})
}

/** Localized label for the time band, or null when there is no band. */
export function resultCardTimeBandText(
	model: ResultCardModel,
	strings: ResultCardStrings,
): string | null {
	if (model.timeBand === 'under1m') return strings.timeUnder1m
	if (model.timeBand === 'under5m') return strings.timeUnder5m
	if (model.timeBand === 'over5m') return strings.timeOver5m
	return null
}

// Every win has four correct submissions. Restored results carry the guess
// count but may not carry mistakes. Omit the count on older or invalid records.
function wordGroupsWinMistakes(attempts?: number | null, mistakes?: number | null): number | null {
	const count = mistakes ?? (attempts == null ? null : attempts - TOTAL_CATEGORIES)
	return count != null && Number.isInteger(count) && count >= 0 && count < MAX_MISTAKES
		? count
		: null
}

export function wordGroupsWinSummary(
	strings: ResultCardStrings,
	attempts?: number | null,
	mistakes?: number | null,
): string {
	return wordGroupsWinDetails(strings, attempts, mistakes).join(strings.detailSeparator)
}

function wordGroupsWinDetails(
	strings: ResultCardStrings,
	attempts?: number | null,
	mistakes?: number | null,
): string[] {
	const parts = [fillCardTemplate(strings.groupsSolvedCount, { total: TOTAL_CATEGORIES })]
	const count = wordGroupsWinMistakes(attempts, mistakes)
	if (count != null) parts.push(fillCardTemplate(strings.mistakeCount, { mistakes: count }))
	return parts
}

/** Up to four glanceable chips; order is fixed so cards compare at a glance. */
export function resultCardChips(
	model: ResultCardModel,
	strings: ResultCardStrings,
): ResultCardChip[] {
	const chips: ResultCardChip[] = []
	const groups = model.gameSlug === 'word-groups'
	if (groups && model.status === 'won') {
		chips.push({
			label: strings.groupsSolvedLabel,
			value: `${TOTAL_CATEGORIES}/${TOTAL_CATEGORIES}`,
		})
		const count = wordGroupsWinMistakes(model.attempts, model.mistakes)
		if (count != null) chips.push({ label: strings.mistakesLabel, value: String(count) })
	} else if (!groups && model.attempts != null) {
		chips.push({
			label: strings.attemptsLabel,
			value:
				model.maxAttempts != null
					? fillCardTemplate(strings.attemptsOf, {
							attempts: model.attempts,
							max: model.maxAttempts,
						})
					: String(model.attempts),
		})
	}
	if (!groups && model.score != null) {
		chips.push({ label: strings.scoreLabel, value: String(model.score) })
	}
	if (model.currentStreak != null) {
		chips.push({ label: strings.streakLabel, value: String(model.currentStreak) })
	}
	// The protocol lists the time band as a glanceable fact; it is banded, not exact.
	const band = resultCardTimeBandText(model, strings)
	if (band && chips.length < 4) {
		chips.push({ label: strings.timeLabel, value: band })
	}
	if (model.mistakes != null && chips.length < 4 && !(groups && model.status === 'won')) {
		chips.push({ label: strings.mistakesLabel, value: String(model.mistakes) })
	}
	return chips
}

export function resultPatternSummary(
	pattern: ResultCardTile[][],
	strings: ResultCardStrings,
): string {
	const count = { hit: 0, near: 0, miss: 0 }
	for (const row of pattern) {
		for (const cell of row) count[cell] += 1
	}
	return fillCardTemplate(strings.patternSummary, count)
}

/** Plain-text alternative to the share card, with the same non-spoiler facts. */
export function resultCardTextAlternative(
	model: ResultCardModel,
	strings: ResultCardStrings,
): string {
	const parts: string[] = []
	const groups = model.gameSlug === 'word-groups'
	if (groups && model.status === 'won') {
		parts.push(...wordGroupsWinDetails(strings, model.attempts, model.mistakes))
	} else if (!groups && model.attempts != null) {
		parts.push(
			model.maxAttempts != null
				? fillCardTemplate(strings.attemptsOf, {
						attempts: model.attempts,
						max: model.maxAttempts,
					})
				: fillCardTemplate(strings.attemptsCount, { attempts: model.attempts }),
		)
	}
	if (!groups && model.score != null) {
		parts.push(fillCardTemplate(strings.scorePoints, { score: model.score }))
	}
	const band = resultCardTimeBandText(model, strings)
	if (band) parts.push(band)
	if (model.currentStreak != null) {
		parts.push(fillCardTemplate(strings.streakDays, { days: model.currentStreak }))
	}
	if (model.pattern) parts.push(resultPatternSummary(model.pattern, strings))
	const day = model.dayDisplay ? fillCardTemplate(strings.altOnDay, { day: model.dayDisplay }) : ''
	const result = model.status === 'won' ? strings.statusWon : strings.statusLost
	const details =
		parts.length > 0
			? fillCardTemplate(strings.altDetailsTemplate, {
					details: parts.join(strings.detailSeparator),
				})
			: ''
	const greeting = model.season && strings.seasonGreeting ? `${strings.seasonGreeting} ` : ''
	return (
		greeting +
		fillCardTemplate(strings.altTemplate, { game: model.gameName, day, result }) +
		details +
		fillCardTemplate(strings.altLinkTemplate, { link: model.deepLink })
	)
}
