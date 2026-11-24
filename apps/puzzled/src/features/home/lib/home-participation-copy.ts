import type { Translate } from '@/lib/i18n/translate'

const MIN_PUBLIC_FINISHERS = 50

export function homeParticipationCopy(t: Translate, count: number | null | undefined): string {
	if (count == null || !Number.isSafeInteger(count) || count < MIN_PUBLIC_FINISHERS) {
		return t('home.hero.dailyInvitation')
	}
	return t('home.hero.playersToday', { count })
}
