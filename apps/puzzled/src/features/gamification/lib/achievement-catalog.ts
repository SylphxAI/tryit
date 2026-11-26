export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'
export type AchievementCategory =
	| 'streak'
	| 'wins'
	| 'score'
	| 'special'
	| 'explorer'
	| 'social'
	| 'dedication'
	| 'secret'

export type Achievement = {
	id: string
	name: string
	description: string
	icon: string // Iconify icon name
	tier: AchievementTier
	category: AchievementCategory
	secret?: boolean // Hidden until unlocked
}

export type UserAchievement = Achievement & {
	unlockedAt?: Date
	progress?: number // For progressive achievements
	target?: number
}

type AchievementDetails = Omit<Achievement, 'id' | 'name' | 'description'>
type AchievementCopy = Pick<Achievement, 'name' | 'description'>

const ACHIEVEMENT_DETAILS = {
	// Streak milestones
	'streak-3': { icon: 'mdi:fire', tier: 'bronze', category: 'streak' },
	'streak-7': { icon: 'mdi:fire', tier: 'silver', category: 'streak' },
	'streak-30': { icon: 'mdi:fire', tier: 'gold', category: 'streak' },
	'streak-100': { icon: 'mdi:fire', tier: 'platinum', category: 'streak' },

	// Win milestones
	'wins-10': { icon: 'mdi:trophy', tier: 'bronze', category: 'wins' },
	'wins-50': { icon: 'mdi:trophy', tier: 'silver', category: 'wins' },
	'wins-100': { icon: 'mdi:trophy', tier: 'gold', category: 'wins' },
	'wins-500': { icon: 'mdi:trophy', tier: 'platinum', category: 'wins' },

	// Five
	'wordle-perfect': { icon: 'mdi:star-four-points', tier: 'gold', category: 'special' },
	'wordle-fast': { icon: 'mdi:lightning-bolt', tier: 'silver', category: 'special' },

	// Quartet
	'connections-perfect': { icon: 'mdi:puzzle', tier: 'gold', category: 'special' },

	// Multi-game
	'all-games': { icon: 'mdi:crown', tier: 'silver', category: 'special' },
	'daily-sweep': { icon: 'mdi:calendar-check', tier: 'gold', category: 'special' },

	// Explorer
	'first-game': { icon: 'mdi:hand-wave', tier: 'bronze', category: 'explorer' },
	'try-all-games': { icon: 'mdi:compass', tier: 'bronze', category: 'explorer' },
	'check-stats': { icon: 'mdi:chart-bar', tier: 'bronze', category: 'explorer' },
	'check-leaderboard': { icon: 'mdi:podium', tier: 'bronze', category: 'explorer' },

	// Social
	'first-share': { icon: 'mdi:share-variant', tier: 'bronze', category: 'social' },
	'share-10': { icon: 'mdi:share-all', tier: 'silver', category: 'social' },
	'leaderboard-top10': { icon: 'mdi:medal', tier: 'gold', category: 'social' },
	'leaderboard-top1': { icon: 'mdi:trophy', tier: 'platinum', category: 'social' },

	// Dedication
	'early-bird': { icon: 'mdi:weather-sunny', tier: 'silver', category: 'dedication' },
	'night-owl': { icon: 'mdi:weather-night', tier: 'silver', category: 'dedication' },
	'weekend-warrior': { icon: 'mdi:calendar-weekend', tier: 'bronze', category: 'dedication' },
	'year-streak': { icon: 'mdi:calendar-star', tier: 'diamond', category: 'dedication' },

	// Secret (hidden until unlocked)
	'secret-perfect-week': {
		icon: 'mdi:star-circle',
		tier: 'gold',
		category: 'secret',
		secret: true,
	},
	'secret-perfect-month': {
		icon: 'mdi:star-shooting',
		tier: 'platinum',
		category: 'secret',
		secret: true,
	},
	'secret-comeback': {
		icon: 'mdi:emoticon-cool',
		tier: 'silver',
		category: 'secret',
		secret: true,
	},
	'secret-speedrun': { icon: 'mdi:lightning-bolt', tier: 'gold', category: 'secret', secret: true },
} satisfies Record<string, AchievementDetails>

type AchievementId = keyof typeof ACHIEVEMENT_DETAILS

export function buildAchievementCatalog(
	copy: Record<AchievementId, AchievementCopy>,
): Achievement[] {
	return (Object.keys(ACHIEVEMENT_DETAILS) as AchievementId[]).map((id) => ({
		id,
		...copy[id],
		...ACHIEVEMENT_DETAILS[id],
	}))
}
