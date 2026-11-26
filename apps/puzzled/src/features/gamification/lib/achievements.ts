import { buildAchievementCatalog } from './achievement-catalog'
import { createAchievementProgress } from './achievement-progress'

export type {
	Achievement,
	AchievementCategory,
	AchievementTier,
	UserAchievement,
} from './achievement-catalog'

// Keep the player-facing literals here: the identity corpus scans this source file directly.
export const ACHIEVEMENTS = buildAchievementCatalog({
	'streak-3': {
		name: 'Getting Started',
		description: 'Win 3 games in a row',
	},
	'streak-7': {
		name: 'Week Warrior',
		description: 'Win 7 games in a row',
	},
	'streak-30': {
		name: 'Monthly Master',
		description: 'Win 30 games in a row',
	},
	'streak-100': {
		name: 'Legendary Streak',
		description: 'Win 100 games in a row',
	},

	'wins-10': {
		name: 'First Steps',
		description: 'Win 10 games total',
	},
	'wins-50': {
		name: 'Rising Star',
		description: 'Win 50 games total',
	},
	'wins-100': {
		name: 'Champion',
		description: 'Win 100 games total',
	},
	'wins-500': {
		name: 'Grand Master',
		description: 'Win 500 games total',
	},

	'wordle-perfect': {
		name: 'Lucky Guess',
		description: 'Solve Five in 1 attempt',
	},
	'wordle-fast': {
		name: 'Quick Thinker',
		description: 'Solve Five in 2 attempts',
	},

	'connections-perfect': {
		name: 'Perfect Quartet',
		description: 'Solve Quartet with no mistakes',
	},

	'all-games': {
		name: 'Renaissance Player',
		description: 'Win at least once in all games',
	},
	'daily-sweep': {
		name: 'Daily Sweep',
		description: 'Win all games in one day',
	},

	'first-game': {
		name: 'Welcome!',
		description: 'Play your first game',
	},
	'try-all-games': {
		name: 'Explorer',
		description: 'Try all game types',
	},
	'check-stats': {
		name: 'Data Lover',
		description: 'View your statistics page',
	},
	'check-leaderboard': {
		name: 'Competitive Spirit',
		description: 'View the leaderboard',
	},

	'first-share': {
		name: 'Sharing is Caring',
		description: 'Share your first result',
	},
	'share-10': {
		name: 'Social Butterfly',
		description: 'Share 10 results',
	},
	'leaderboard-top10': {
		name: 'Ranked',
		description: 'Reach top 10 on any leaderboard',
	},
	'leaderboard-top1': {
		name: 'Number One',
		description: 'Reach #1 on any leaderboard',
	},

	'early-bird': {
		name: 'Early Bird',
		description: 'Play a game before 7 AM',
	},
	'night-owl': {
		name: 'Night Owl',
		description: 'Play a game after 11 PM',
	},
	'weekend-warrior': {
		name: 'Weekend Warrior',
		description: 'Play every day of a weekend',
	},
	'year-streak': {
		name: 'Annual Legend',
		description: 'Maintain a 365-day streak',
	},

	'secret-perfect-week': {
		name: 'Perfect Week',
		description: 'Win every game for 7 days straight',
	},
	'secret-perfect-month': {
		name: 'Perfect Month',
		description: 'Win every game for 30 days straight',
	},
	'secret-comeback': {
		name: 'Comeback Kid',
		description: 'Win after using all but one attempt',
	},
	'secret-speedrun': {
		name: 'Speedrunner',
		description: 'Complete all games in under 5 minutes',
	},
})

export const { checkAchievements, getNextAchievements } = createAchievementProgress(ACHIEVEMENTS)

// Achievement tier colors
export const TIER_COLORS = {
	bronze: 'text-amber-600',
	silver: 'text-slate-500 dark:text-slate-400',
	gold: 'text-yellow-500',
	platinum: 'text-cyan-500 dark:text-cyan-400',
	diamond: 'text-violet-500 dark:text-violet-400',
} as const

export const TIER_BG_COLORS = {
	bronze: 'bg-amber-600/10',
	silver: 'bg-slate-500/10',
	gold: 'bg-yellow-500/10',
	platinum: 'bg-cyan-500/10',
	diamond: 'bg-violet-500/10',
} as const
