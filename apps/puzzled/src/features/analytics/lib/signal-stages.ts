/**
 * Consented ad-optimization funnel stages on the Signal stream:
 * game_start -> game_finish -> plus_view -> (server) checkout_started -> purchase.
 *
 * Every property is rebuilt from an allowlist, so no free-form text, player,
 * auth or customer identifier, or email can reach the payload. Delivery uses
 * the page-view gate in consent.ts: denied, EEA-unanswered and GPC send nothing.
 */
import { canonicalizeGameSlug, PLAYER_TITLE } from '@/lib/game-slug'
import { trustedEntrySurface } from './checkout-entry-surface'
import { trackSignalEvent } from './consent'

const MODES = ['daily', 'archive', 'practice'] as const
const STATUSES = ['won', 'lost'] as const
const ORDER_ID = /^[A-Za-z0-9_-]{1,128}$/

export type StageMode = (typeof MODES)[number]

/** An allowlisted entry surface; anything unknown, absent or malformed is `other`. */
export function stageEntrySurface(value: unknown): string {
	return trustedEntrySurface(value) ?? 'other'
}

function gameSlug(value: unknown): string | undefined {
	if (typeof value !== 'string' || value.length > 64) return undefined
	const slug = canonicalizeGameSlug(value)
	return Object.hasOwn(PLAYER_TITLE, slug) ? slug : undefined
}

function oneOf<T extends string>(value: unknown, options: readonly T[]): T | undefined {
	return options.find((option) => option === value)
}

/** The first playable board of a mounted game. */
export function trackGameStartStage(slug: string, mode: StageMode): boolean {
	const game_slug = gameSlug(slug)
	const cleanMode = oneOf(mode, MODES)
	if (!game_slug || !cleanMode) return false
	return trackSignalEvent('game_start', { game_slug, mode: cleanMode })
}

/** A finish the api accepted (called after the submit resolves, never on a local guess). */
export function trackGameFinishStage(
	slug: string,
	mode: StageMode,
	status: 'won' | 'lost',
): boolean {
	const game_slug = gameSlug(slug)
	const cleanMode = oneOf(mode, MODES)
	const cleanStatus = oneOf(status, STATUSES)
	if (!game_slug || !cleanMode || !cleanStatus) return false
	return trackSignalEvent('game_finish', { game_slug, mode: cleanMode, status: cleanStatus })
}

const viewedSurfaces = new Set<string>()

/** One Plus offer view per surface per page load. */
export function trackPlusViewStage(surface: unknown): boolean {
	const entry_surface = stageEntrySurface(surface)
	if (viewedSurfaces.has(entry_surface)) return false
	const sent = trackSignalEvent('plus_view', { entry_surface })
	if (sent) viewedSurfaces.add(entry_surface)
	return sent
}

export function resetPlusViewStages(): void {
	viewedSurfaces.clear()
}

/** The Money-settled receipt the api returned; there is no browser-asserted variant. */
export type SettledReceipt = { orderId: string; value: number; currency: string }

async function digest(value: string): Promise<string> {
	const bytes = new Uint8Array(
		await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
	)
	return btoa(String.fromCharCode(...bytes))
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replace(/=+$/, '')
}

/**
 * `purchase` from the api's settled checkout receipt only. The processor order
 * id is hashed into a stable event id, so a reload is deduplicated by Signal
 * and the raw id never leaves the page.
 */
export async function trackPurchaseStage(receipt: SettledReceipt): Promise<boolean> {
	const { orderId, value, currency } = receipt
	if (!ORDER_ID.test(orderId) || !Number.isFinite(value) || value <= 0) return false
	if (!/^[A-Z]{3}$/.test(currency)) return false
	try {
		const eventId = `purchase:${await digest(orderId)}`
		return trackSignalEvent('purchase', { value, currency }, { eventId, numericValue: value })
	} catch {
		return false
	}
}
