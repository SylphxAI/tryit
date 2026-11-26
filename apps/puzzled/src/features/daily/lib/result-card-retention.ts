import type { StreakInfo } from '@/gen/connect/puzzled/v1/gamification_pb'
import type { ResultCardModel } from './result-card'

type Streak = Pick<StreakInfo, 'currentStreak' | 'freezeUsedYesterday'>

export function resultCardRetention(
	card: { mode: ResultCardModel['mode'] | 'practice'; status: ResultCardModel['status'] },
	streak: Streak | null,
	isGuest: boolean | undefined,
) {
	const dailyWin = card.mode === 'daily' && card.status === 'won'
	const days = card.mode === 'daily' ? (streak?.currentStreak ?? null) : null
	return {
		days,
		milestone: dailyWin && (days === 3 || days === 7 || days === 30 || days === 100) ? days : null,
		freezeSaved: dailyWin && streak?.freezeUsedYesterday === true,
		captureGuest: isGuest === true && days !== null && days >= 1,
	}
}
