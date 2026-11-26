/** Public share-card API and the shared translation adapter. */
import type { ResultCardStrings } from './result-card-format'

export {
	type ResultCardChip,
	type ResultCardStrings,
	resultCardChips,
	resultCardTextAlternative,
	resultCardTimeBandText,
	resultPatternSummary,
	resultPercentileLabel,
	wordGroupsWinSummary,
} from './result-card-format'
export {
	buildResultCard,
	formatCardDayKey,
	type ResultCardInput,
	type ResultCardMode,
	type ResultCardModel,
	type ResultCardStatus,
	type ResultCardTimeBand,
	resultCardTimeBand,
} from './result-card-model'
export {
	FIVE_RESULT_TILE_COLORS,
	parseResultPattern,
	RESULT_CARD_PATTERN_MAX_COLS,
	RESULT_CARD_PATTERN_MAX_ROWS,
	type ResultCardTile,
} from './result-card-pattern'

/**
 * The card copy from one translator for the `share.card` block, so every
 * surface that draws a card (the sharer's, the landing, the side-by-side
 * result) builds the same strings the same way. The translator must return the
 * raw template (`t.raw`): the sentences keep their `{tokens}` until
 * `fillCardTemplate` fills them, and a formatted read throws on them.
 */
export function resultCardStringsFrom(
	t: (key: Exclude<keyof ResultCardStrings, 'seasonGreeting'>) => string,
	seasonGreeting: string | null = null,
): ResultCardStrings {
	return {
		statusWon: t('statusWon'),
		statusLost: t('statusLost'),
		attemptsLabel: t('attemptsLabel'),
		scoreLabel: t('scoreLabel'),
		streakLabel: t('streakLabel'),
		timeLabel: t('timeLabel'),
		mistakesLabel: t('mistakesLabel'),
		groupsSolvedLabel: t('groupsSolvedLabel'),
		groupsSolvedCount: t('groupsSolvedCount'),
		mistakeCount: t('mistakeCount'),
		timeUnder1m: t('timeUnder1m'),
		timeUnder5m: t('timeUnder5m'),
		timeOver5m: t('timeOver5m'),
		attemptsOf: t('attemptsOf'),
		attemptsCount: t('attemptsCount'),
		scorePoints: t('scorePoints'),
		streakDays: t('streakDays'),
		patternSummary: t('patternSummary'),
		altOnDay: t('altOnDay'),
		altTemplate: t('altTemplate'),
		altDetailsTemplate: t('altDetailsTemplate'),
		altLinkTemplate: t('altLinkTemplate'),
		detailSeparator: t('detailSeparator'),
		seasonGreeting,
	}
}
