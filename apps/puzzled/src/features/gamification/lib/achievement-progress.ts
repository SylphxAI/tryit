import type { Achievement, UserAchievement } from './achievement-catalog'

export function createAchievementProgress(achievements: Achievement[]) {
	const achievementMap = new Map(achievements.map((achievement) => [achievement.id, achievement]))

	/**
	 * Get achievement by ID - throws if not found (catches typos at dev time)
	 */
	function getAchievement(id: string): Achievement {
		const achievement = achievementMap.get(id)
		if (!achievement) {
			throw new Error(`[Achievements] Unknown achievement ID: ${id}`)
		}
		return achievement
	}

	// Check achievements based on user stats
	function checkAchievements(stats: {
		totalWins: number
		maxStreak: number
		wordleWins: number
		connectionsWins: number
		wordleBestAttempts?: number
		connectionsPerfectGames?: number
	}): UserAchievement[] {
		const unlocked: UserAchievement[] = []
		const now = new Date()

		// Check streak achievements
		if (stats.maxStreak >= 3) {
			unlocked.push({ ...getAchievement('streak-3'), unlockedAt: now })
		}
		if (stats.maxStreak >= 7) {
			unlocked.push({ ...getAchievement('streak-7'), unlockedAt: now })
		}
		if (stats.maxStreak >= 30) {
			unlocked.push({ ...getAchievement('streak-30'), unlockedAt: now })
		}
		if (stats.maxStreak >= 100) {
			unlocked.push({ ...getAchievement('streak-100'), unlockedAt: now })
		}

		// Check win count achievements
		if (stats.totalWins >= 10) {
			unlocked.push({ ...getAchievement('wins-10'), unlockedAt: now })
		}
		if (stats.totalWins >= 50) {
			unlocked.push({ ...getAchievement('wins-50'), unlockedAt: now })
		}
		if (stats.totalWins >= 100) {
			unlocked.push({ ...getAchievement('wins-100'), unlockedAt: now })
		}
		if (stats.totalWins >= 500) {
			unlocked.push({ ...getAchievement('wins-500'), unlockedAt: now })
		}

		// Check special achievements
		if (stats.wordleBestAttempts === 1) {
			unlocked.push({ ...getAchievement('wordle-perfect'), unlockedAt: now })
		}
		if (stats.wordleBestAttempts && stats.wordleBestAttempts <= 2) {
			unlocked.push({ ...getAchievement('wordle-fast'), unlockedAt: now })
		}

		if (stats.connectionsPerfectGames && stats.connectionsPerfectGames > 0) {
			unlocked.push({
				...getAchievement('connections-perfect'),
				unlockedAt: now,
			})
		}

		// All games achievement
		if (stats.wordleWins > 0 && stats.connectionsWins > 0) {
			unlocked.push({ ...getAchievement('all-games'), unlockedAt: now })
		}

		return unlocked
	}

	// Get next achievement to unlock
	function getNextAchievements(stats: { totalWins: number; maxStreak: number }): UserAchievement[] {
		const next: UserAchievement[] = []

		// Find next streak achievement
		const streakTargets = [3, 7, 30, 100] as const
		for (const target of streakTargets) {
			if (stats.maxStreak < target) {
				const achievement = achievementMap.get(`streak-${target}`)
				if (achievement) {
					next.push({ ...achievement, progress: stats.maxStreak, target })
				}
				break
			}
		}

		// Find next wins achievement
		const winsTargets = [10, 50, 100, 500] as const
		for (const target of winsTargets) {
			if (stats.totalWins < target) {
				const achievement = achievementMap.get(`wins-${target}`)
				if (achievement) {
					next.push({ ...achievement, progress: stats.totalWins, target })
				}
				break
			}
		}

		return next
	}

	return { checkAchievements, getNextAchievements }
}
