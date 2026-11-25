/** @jsxImportSource solid-js */
import type { Locale } from '@/lib/i18n/config'
import { dailyPlayerCopy } from '../lib/daily-player-copy'

export function DailyPickCount(props: { count: number; locale: Locale }) {
	const copy = dailyPlayerCopy(props.locale)
	return <span data-pick-count={props.count}>{copy.picks(props.count)}</span>
}
