/** Canvas primitives and shared styling for the result card. */
import { type GameColorTheme, getGameColors } from '@/games/theme-colors'

export const RESULT_CARD_SIZE = 1080

export const FONT_FAMILY =
	"-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', 'PingFang TC', 'Noto Sans TC', 'Noto Sans SC', sans-serif"

export interface ResultCardPalette {
	/** Paper ground. */
	bg: string
	/** The module's field colour (the band). */
	accent: string
	/** Hairlines and chip borders. */
	frame: string
	chipBg: string
	chipStroke: string
	text: string
	textMuted: string
	/** A solved tile: the module's deep hue. */
	tileHit: string
	tileNear: string
	tileMiss: string
}

/** The palette follows the module theme in theme-colors.ts. */
export function resultCardPalette(theme: GameColorTheme): ResultCardPalette {
	const colors = getGameColors(theme)
	return {
		bg: '#f7f4ee',
		accent: colors.hex,
		frame: 'rgba(26,23,18,0.12)',
		chipBg: '#ffffff',
		chipStroke: '#e4ded2',
		text: '#1a1712',
		textMuted: 'rgba(26,23,18,0.62)',
		tileHit: colors.deepHex,
		tileNear: '#f4b42a',
		tileMiss: '#e4ded2',
	}
}

export function roundedRect(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number,
): void {
	const radius = Math.max(0, Math.min(r, w / 2, h / 2))
	ctx.beginPath()
	ctx.moveTo(x + radius, y)
	ctx.lineTo(x + w - radius, y)
	ctx.arcTo(x + w, y, x + w, y + radius, radius)
	ctx.lineTo(x + w, y + h - radius)
	ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius)
	ctx.lineTo(x + radius, y + h)
	ctx.arcTo(x, y + h, x, y + h - radius, radius)
	ctx.lineTo(x, y + radius)
	ctx.arcTo(x, y, x + radius, y, radius)
	ctx.closePath()
}

/** Largest whole size in [minPx, startPx] whose rendered text fits maxWidth. */
export function fitTextSize(
	ctx: CanvasRenderingContext2D,
	text: string,
	maxWidth: number,
	startPx: number,
	minPx: number,
	weight: string,
): number {
	let px = Math.round(startPx)
	const floor = Math.round(minPx)
	while (px > floor) {
		ctx.font = `${weight} ${px}px ${FONT_FAMILY}`
		if (ctx.measureText(text).width <= maxWidth) return px
		px -= 2
	}
	return floor
}
