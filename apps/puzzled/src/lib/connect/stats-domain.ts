export type GetTodayPercentileInput = {
	gameSlug: string
	/** Day the displayed result was served for; checked against the server day. */
	dayKey: string
}

export function validateGetTodayPercentileInput(input: GetTodayPercentileInput): string | null {
	if (!input.gameSlug.trim()) return 'game_slug_required'
	if (input.gameSlug.length > 64) return 'game_slug_too_long'
	if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dayKey)) return 'day_key_required'
	return null
}
