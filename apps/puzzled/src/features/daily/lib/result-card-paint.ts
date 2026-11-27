import { getGameColors } from '@/games/theme-colors'
import { PRODUCTION_SITE_ORIGIN } from '@/lib/site-origin'
import {
	type ResultCardModel,
	type ResultCardStrings,
	type ResultCardTile,
	resultCardChips,
	resultTileFixedColor,
} from './result-card'
import {
	FONT_FAMILY,
	fitTextSize,
	RESULT_CARD_SIZE,
	resultCardPalette,
	roundedRect,
} from './result-card-canvas'

const BRAND_HOST = new URL(PRODUCTION_SITE_ORIGIN).hostname
/** The PNG encoder supplies the page display font when available. */
const DISPLAY_FALLBACK = "'Iowan Old Style', 'Palatino Linotype', Georgia, 'Noto Serif TC', serif"

const PAD = 96
/** The pastel band that carries the module's colour. */
const BAND_H = 468

export interface ResultCardPaintOptions {
	size?: number
	/** Resolved display family (the page's Fraunces); falls back to a serif stack. */
	displayFamily?: string
}

/**
 * Paint one card. Synchronous, DOM-free, deterministic: the same model and
 * strings always paint the same calls.
 *
 * Layout: paper ground; a pastel band in the module's colour with the
 * wordmark, the day, the module name and the result; up to four fact chips;
 * the non-spoiler pattern; the brand footer.
 */
export function paintResultCard(
	ctx: CanvasRenderingContext2D,
	model: ResultCardModel,
	strings: ResultCardStrings,
	options: ResultCardPaintOptions = {},
): void {
	const size = options.size ?? RESULT_CARD_SIZE
	const scale = size / RESULT_CARD_SIZE
	const palette = resultCardPalette(model.theme)
	const display = options.displayFamily
		? `${options.displayFamily}, ${DISPLAY_FALLBACK}`
		: DISPLAY_FALLBACK

	ctx.save()

	ctx.fillStyle = palette.bg
	ctx.fillRect(0, 0, size, size)

	// The band: the module's own colour, rounded at the bottom like a card lip.
	roundedRect(ctx, 32 * scale, 32 * scale, size - 64 * scale, BAND_H * scale, 44 * scale)
	ctx.fillStyle = palette.accent
	ctx.fill()

	const innerX = PAD * scale
	const innerW = (RESULT_CARD_SIZE - PAD * 2) * scale
	ctx.textBaseline = 'alphabetic'
	ctx.textAlign = 'left'

	// Wordmark left, product day right.
	ctx.fillStyle = palette.text
	ctx.font = `600 ${Math.round(44 * scale)}px ${display}`
	ctx.fillText('Tryit', innerX, 134 * scale)
	if (model.dayDisplay) {
		ctx.textAlign = 'right'
		ctx.fillStyle = palette.textMuted
		ctx.font = `500 ${Math.round(32 * scale)}px ${FONT_FAMILY}`
		ctx.fillText(model.dayDisplay, innerX + innerW, 132 * scale)
		ctx.textAlign = 'left'
	}

	// The module's name is the biggest thing on the card.
	const titleSize = fitTextSize(ctx, model.gameName, innerW, 132 * scale, 64 * scale, '600')
	ctx.font = `600 ${titleSize}px ${display}`
	ctx.fillStyle = palette.text
	ctx.fillText(model.gameName, innerX, 330 * scale)

	ctx.font = `600 ${Math.round(44 * scale)}px ${FONT_FAMILY}`
	ctx.fillStyle = palette.text
	ctx.fillText(model.status === 'won' ? strings.statusWon : strings.statusLost, innerX, 418 * scale)

	// Seasonal day only: a pill in the season's accent carries the greeting.
	if (model.season && strings.seasonGreeting) {
		const pillH = 52 * scale
		const pillY = 436 * scale
		ctx.font = `600 ${Math.round(28 * scale)}px ${FONT_FAMILY}`
		const label = `${model.season.glyph} ${strings.seasonGreeting}`
		const pillW = Math.min(innerW, ctx.measureText(label).width + 48 * scale)
		roundedRect(ctx, innerX, pillY, pillW, pillH, pillH / 2)
		ctx.fillStyle = getGameColors(model.season.accent).hex
		ctx.fill()
		ctx.strokeStyle = palette.frame
		ctx.lineWidth = 2 * scale
		ctx.stroke()
		ctx.fillStyle = palette.text
		ctx.fillText(label, innerX + 24 * scale, pillY + 36 * scale, pillW - 48 * scale)
	}

	// Chips: up to four glanceable facts on white cards.
	const chips = resultCardChips(model, strings)
	const chipY = 540 * scale
	const chipH = 136 * scale
	if (chips.length > 0) {
		const gap = 20 * scale
		const chipW = (innerW - gap * (chips.length - 1)) / chips.length
		for (let i = 0; i < chips.length; i += 1) {
			const chip = chips[i]
			if (!chip) continue
			const x = innerX + i * (chipW + gap)
			roundedRect(ctx, x, chipY, chipW, chipH, 26 * scale)
			ctx.fillStyle = palette.chipBg
			ctx.fill()
			ctx.strokeStyle = palette.chipStroke
			ctx.lineWidth = 2 * scale
			ctx.stroke()

			ctx.textAlign = 'center'
			ctx.fillStyle = palette.textMuted
			ctx.font = `600 ${Math.round(26 * scale)}px ${FONT_FAMILY}`
			ctx.fillText(chip.label, x + chipW / 2, chipY + 50 * scale)
			const valueSize = fitTextSize(
				ctx,
				chip.value,
				chipW - 40 * scale,
				56 * scale,
				28 * scale,
				'700',
			)
			ctx.fillStyle = palette.text
			ctx.font = `700 ${valueSize}px ${FONT_FAMILY}`
			ctx.fillText(chip.value, x + chipW / 2, chipY + 110 * scale)
			ctx.textAlign = 'left'
		}
	}

	// Pattern: hit / near / miss tiles, capped by the model (12x12).
	if (model.pattern) {
		const themed = { hit: palette.tileHit, near: palette.tileNear, miss: palette.tileMiss }
		const tileColor = (tile: ResultCardTile) =>
			resultTileFixedColor(model.gameSlug, tile) ?? themed[tile as keyof typeof themed]
		const rows = model.pattern.length
		let cols = 0
		for (const row of model.pattern) cols = Math.max(cols, row.length)
		const gap = 12 * scale
		const bandTop = (chips.length > 0 ? 716 : 540) * scale
		const bandBottom = 940 * scale
		const availH = bandBottom - bandTop
		const availW = Math.min(innerW, 720 * scale)
		const tile = Math.max(
			10,
			Math.min(88 * scale, (availW - gap * (cols - 1)) / cols, (availH - gap * (rows - 1)) / rows),
		)
		const gridW = tile * cols + gap * (cols - 1)
		const gridH = tile * rows + gap * (rows - 1)
		const startX = innerX + (innerW - gridW) / 2
		const startY = bandTop + (availH - gridH) / 2
		for (let r = 0; r < rows; r += 1) {
			const row = model.pattern[r]
			if (!row) continue
			for (const [c, value] of row.entries()) {
				roundedRect(
					ctx,
					startX + c * (tile + gap),
					startY + r * (tile + gap),
					tile,
					tile,
					tile * 0.2,
				)
				ctx.fillStyle = tileColor(value)
				ctx.fill()
			}
		}
	}

	// Keep route and attribution in the share caption, not in the painted footer.
	ctx.strokeStyle = palette.frame
	ctx.lineWidth = 2 * scale
	ctx.beginPath()
	ctx.moveTo(innerX, 966 * scale)
	ctx.lineTo(innerX + innerW, 966 * scale)
	ctx.stroke()
	ctx.textAlign = 'center'
	ctx.fillStyle = palette.textMuted
	ctx.font = `500 ${Math.round(28 * scale)}px ${FONT_FAMILY}`
	ctx.fillText(BRAND_HOST, innerX + innerW / 2, 1020 * scale)
	ctx.textAlign = 'left'

	ctx.restore()
}
