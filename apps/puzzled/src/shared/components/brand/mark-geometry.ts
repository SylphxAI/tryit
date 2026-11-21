import wordmark from '../../../../../../brand/wordmark.json'

/**
 * Tryit brand mark and wordmark.
 *
 * The mark is a T built from five puzzle tiles: three across, two down, and
 * the last one amber, the piece that clicks into place. It mirrors
 * brand/svg/puzzled-symbol.svg (64-unit canvas), so the app, the OG card and
 * the raster icons stay one shape. The ground and tiles read the primary
 * tokens, so the mark is ink on paper and paper on charcoal without a second
 * asset.
 */

/** Tile side on the 64-unit canvas. */
export const MARK_TILE = 14
/** Tile corner radius on the 64-unit canvas. */
export const MARK_TILE_RADIUS = 3.2
/** The paper tiles: the T's bar and the top of its stem. */
export const MARK_TILES: ReadonlyArray<readonly [number, number]> = [
	[8.5, 8.5],
	[25, 8.5],
	[41.5, 8.5],
	[25, 25],
]
/** The amber keystone at the foot of the stem. */
export const MARK_KEYSTONE: readonly [number, number] = [25, 41.5]
export const MARK_AMBER = '#F4B42A'

/** Fraunces 600 outline of "Tryit" (brand/svg/puzzled-wordmark.svg). */
export const WORDMARK_VIEWBOX = wordmark.viewBox
export const WORDMARK_PATH = wordmark.path
