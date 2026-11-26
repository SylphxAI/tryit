import type { ResultCardModel, ResultCardStrings } from './result-card'
import { RESULT_CARD_SIZE } from './result-card-canvas'
import { paintResultCard, type ResultCardPaintOptions } from './result-card-paint'

/** The page's resolved display family, when the page has one. */
function pageDisplayFamily(): string | undefined {
	if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return undefined
	const value = getComputedStyle(document.documentElement)
		.getPropertyValue('--font-display-family')
		.trim()
	return value || undefined
}

/**
 * Paint and encode. Returns null when there is no DOM (server render, tests) -
 * callers fall back to the text share in that case.
 */
export async function resultCardBlob(
	model: ResultCardModel,
	strings: ResultCardStrings,
	options: ResultCardPaintOptions = {},
): Promise<Blob | null> {
	if (typeof document === 'undefined') return null
	const size = options.size ?? RESULT_CARD_SIZE
	const canvas = document.createElement('canvas')
	canvas.width = size
	canvas.height = size
	const ctx = canvas.getContext('2d')
	if (!ctx) return null
	if (document.fonts?.ready) await document.fonts.ready
	paintResultCard(ctx, model, strings, { size, displayFamily: pageDisplayFamily() })
	return await new Promise<Blob | null>((resolve) => {
		canvas.toBlob((blob) => resolve(blob), 'image/png')
	})
}

/** Download/attachment name: tryit-result-<slug>[-<day>].png */
export function resultCardFileName(model: ResultCardModel): string {
	const slug =
		model.gameSlug
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'puzzled'
	return model.dayKey ? `tryit-result-${slug}-${model.dayKey}.png` : `tryit-result-${slug}.png`
}
