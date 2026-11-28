import { isFieldSet } from '@bufbuild/protobuf'
import { type Accessor, createMemo, createResource } from 'solid-js'
import { getAllGameMetadata } from '@/games/registry'
import { GetTodayPercentileResponseSchema } from '@/gen/connect/puzzled/v1/stats_pb'
import { createGamificationServiceClient } from '@/lib/connect/gamification-client'
import { getTodayProgress } from '@/lib/connect/puzzle-client'
import { getTodayPercentile } from '@/lib/connect/stats-client'
import { freeGameForDayKey } from '@/lib/free-rotation'
import type { Locale } from '@/lib/i18n/config'
import type { Translate } from '@/lib/i18n/translate'
import { deriveHomeExposure } from '../lib/home-exposure'
import {
	type ResultCardInput,
	type ResultCardModel,
	resultPercentileLabel,
} from '../lib/result-card'
import { resultCardRetention } from '../lib/result-card-retention'
import { resultRitual } from '../lib/result-ritual'

export function createResultDailyContext(
	props: {
		facts: Pick<ResultCardInput, 'gameSlug' | 'todayKey'>
		locale: Locale
		isGuest?: boolean
	},
	model: Accessor<ResultCardModel>,
	mounted: Accessor<boolean>,
	t: Translate,
) {
	const ritualDay = createMemo(() => {
		const current = model()
		return mounted() && current.mode === 'daily' && current.dayKey === props.facts.todayKey
			? current.dayKey
			: undefined
	})
	const won = createMemo(() => model().status === 'won')
	const percentileGame = createMemo(() => props.facts.gameSlug)
	const percentileInput = createMemo(() => {
		const dayKey = ritualDay()
		return dayKey && won() ? { dayKey, gameSlug: percentileGame() } : false
	})
	const [percentile] = createResource(
		percentileInput,
		async (input) => {
			try {
				const response = await getTodayPercentile(input)
				// Protobuf getters return 0 even when the wire field was absent.
				return isFieldSet(response, GetTodayPercentileResponseSchema.field.percentile)
					? response.percentile
					: null
			} catch {
				return null
			}
		},
		{ initialValue: null },
	)
	const percentileLabel = () =>
		percentileInput() && !percentile.loading
			? resultPercentileLabel(percentile.latest ?? undefined, props.locale, (percent) =>
					t('gameResult.todayPercentile', { percent }),
				)
			: null
	const [ritual] = createResource(
		ritualDay,
		async (dayKey) => {
			try {
				const modules = getAllGameMetadata()
				const progress = await getTodayProgress(modules.map(({ slug }) => slug))
				const { slugs } = deriveHomeExposure({
					modules,
					dayKey,
					freeGameSlug: freeGameForDayKey(dayKey),
					completions: {},
					limit: modules.length,
				})
				return resultRitual(progress, dayKey, props.facts.gameSlug, slugs)
			} catch {
				return null
			}
		},
		{ initialValue: null },
	)
	const [streak] = createResource(
		() => (won() || props.isGuest === true) && ritualDay(),
		async () => {
			try {
				const response = await createGamificationServiceClient().getStreakInfo({})
				return response.info ?? null
			} catch {
				return null
			}
		},
	)
	const retention = createMemo(() =>
		resultCardRetention(model(), ritualDay() ? (streak.latest ?? null) : null, props.isGuest),
	)
	const streakCountLabel = (days: number) =>
		`${t('streak.currentStreak')}: ${new Intl.NumberFormat(props.locale).format(days)}`
	const streakPending = () =>
		Boolean(ritualDay() && (streak.loading || streak.state === 'unresolved'))
	// Wait for the resources that can change the height of the finish rail.
	const layoutReady = () => mounted() && !ritual.loading && !percentile.loading && !streakPending()
	return { percentileLabel, ritual, retention, streakCountLabel, streakPending, layoutReady }
}
