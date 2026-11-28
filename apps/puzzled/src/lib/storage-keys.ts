/**
 * Centralized localStorage keys
 *
 * All localStorage keys should be defined here to ensure:
 * - Single source of truth
 * - Consistent naming convention
 * - Easy discovery and refactoring
 * - Prevent key collisions
 *
 * Naming convention: 'puzzled:{domain}:{key}'
 * - Use colons as separators
 * - Domain groups related keys
 * - Keep keys lowercase with hyphens
 */

// ==========================================
// Consent & Privacy
// ==========================================
export const SIGNAL_STORAGE_KEY = 'puzzled:signal'
export const CONSENT_KEY = `${SIGNAL_STORAGE_KEY}.consent`
/** The consent text version a saved choice was made under (see CONSENT_VERSION). */
export const CONSENT_VERSION_KEY = `${SIGNAL_STORAGE_KEY}.consent-version`

// ==========================================
// Sound & Audio
// ==========================================
export const SOUND_ENABLED_KEY = 'puzzled:sound:enabled'

// ==========================================
// PWA & Prompts
// ==========================================
export const CAGE_SUDOKU_CUE_SEEN_KEY = 'puzzled:game:killer-sudoku:cue-seen'
export const PWA_PROMPT_DISMISSED_KEY = 'puzzled:pwa:prompt-dismissed'
export const SAVE_STREAK_DISMISSED_DAY_KEY = 'puzzled:result:save-streak-dismissed-day'

// ==========================================
// Daily play continuity
// ==========================================
/** Same-tab in-progress daily board state; strictly necessary for reload recovery. */
export const DAILY_PLAY_DRAFT_PREFIX = 'puzzled:play-draft:v2:'
export const DAILY_PLAY_DRAFT_TAB_KEY = 'puzzled:play-draft-tab'

/**
 * Same-tab, one-shot record of a pressed "Play" for one game
 * (`{ slug, at }`), read once by that game's page to open the board without a
 * second press. Session storage: a shared or crawled link never carries it.
 */
export const START_INTENT_KEY = 'puzzled:start:intent'

// ==========================================
// Share challenge
// ==========================================
/** The share a visitor opened ({ shareId, gameSlug, dayKey }); read by the result screen to show both results. */
export const CHALLENGE_KEY = 'puzzled:challenge:share'

// ==========================================
// Guest User Data
// ==========================================
export const GUEST_GAMES_KEY = 'puzzled:guest:games'
/** Stable guest-day UUID (client-bound); sent as X-Puzzled-Guest-Id for free ritual finishes. */
export const GUEST_DAY_ID_KEY = 'puzzled:guest:day-id'

// ==========================================
// Game Session (dynamic per game)
// ==========================================
/**
 * Get the localStorage key for tracking if a game was started today
 * @param gameSlug - The game identifier (e.g., 'word-guess', 'sudoku')
 * @param puzzleId - Optional puzzle ID for specific puzzle tracking
 */
export function getGameSessionKey(gameSlug: string, puzzleId?: string): string {
	return puzzleId
		? `puzzled:game:${gameSlug}:${puzzleId}:started`
		: `puzzled:game:${gameSlug}:started`
}

/** Product day (YYYY-MM-DD) of this browser's first finished puzzle; gates the install offer. */
export const FIRST_FINISH_DAY_KEY = 'puzzled:pwa:first-finish-day'
