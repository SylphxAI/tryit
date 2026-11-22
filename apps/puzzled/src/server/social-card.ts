import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { renderAsync } from '@resvg/resvg-js'
import satori from 'satori'
import { getAllGameMetadata } from '@/games/registry'
import { type GameColorTheme, getGameColors } from '@/games/theme-colors'
import { isValidLocale } from '@/lib/i18n/config'
import {
	MARK_AMBER,
	MARK_KEYSTONE,
	MARK_TILE,
	MARK_TILE_RADIUS,
	MARK_TILES,
	WORDMARK_PATH,
	WORDMARK_VIEWBOX,
} from '@/shared/components/brand/mark-geometry'

const INK = '#1a1712'
const PAPER = '#f7f4ee'
const MUTED = '#5f584c'
const DEFAULT_BADGE = `Any 3 of ${getAllGameMetadata().length} puzzles free every day`

let fonts: Promise<Awaited<ReturnType<typeof loadFonts>>> | undefined

async function loadFonts() {
	const [display, body, bold] = await Promise.all(
		['fraunces-600.ttf', 'figtree-latin-400.woff', 'figtree-latin-600.woff'].map((name) =>
			readFile(join(process.cwd(), 'public', 'fonts', name)),
		),
	)
	return [
		{ name: 'Fraunces', weight: 600 as const, data: display },
		{ name: 'Figtree', weight: 400 as const, data: body },
		{ name: 'Figtree', weight: 600 as const, data: bold },
	]
}

function clamp(value: string | null, max: number): string {
	if (!value) return ''
	const chars = Array.from(value)
	return chars.length <= max ? value : `${chars.slice(0, max - 1).join('')}…`
}

type CardElement = {
	type: string
	key: null
	props: Record<string, unknown>
}

// Satori accepts a plain element tree; no JSX runtime or browser is used.
function el(
	type: string,
	props: Record<string, unknown>,
	...children: (CardElement | string | null)[]
): CardElement {
	return {
		type,
		key: null,
		props: { ...props, children: children.length === 1 ? children[0] : children },
	}
}

function tile([x, y]: readonly [number, number], fill: string) {
	return el('rect', { x, y, width: MARK_TILE, height: MARK_TILE, rx: MARK_TILE_RADIUS, fill })
}

export async function renderSocialCard(request: Request): Promise<Response> {
	const params = new URL(request.url).searchParams
	const title = clamp(params.get('title'), 64) || 'Tryit'
	const subtitle = clamp(params.get('subtitle'), 96)
	const eyebrow = clamp(params.get('eyebrow'), 40)
	const badge = clamp(params.get('badge'), 44) || DEFAULT_BADGE
	const theme = getGameColors((params.get('theme') ?? '') as GameColorTheme)?.hex
	const [, , wordW, wordH] = WORDMARK_VIEWBOX.split(' ').map(Number)

	const markup = el(
		'div',
		{
			style: {
				width: '100%',
				height: '100%',
				display: 'flex',
				padding: 64,
				gap: 56,
				background: PAPER,
				color: INK,
				fontFamily: 'Figtree',
			},
		},
		el(
			'div',
			{
				style: {
					display: 'flex',
					flexDirection: 'column',
					justifyContent: 'space-between',
					flex: 1,
				},
			},
			el(
				'svg',
				{ width: Math.round((34 * wordW) / wordH), height: 34, viewBox: WORDMARK_VIEWBOX },
				el('path', { d: WORDMARK_PATH, fill: INK }),
			),
			el(
				'div',
				{ style: { display: 'flex', flexDirection: 'column', gap: 18 } },
				eyebrow
					? el(
							'span',
							{
								style: { fontSize: 22, letterSpacing: 3, textTransform: 'uppercase', color: MUTED },
							},
							eyebrow,
						)
					: null,
				el(
					'span',
					{
						style: {
							fontFamily: 'Fraunces, Figtree',
							fontSize: 76,
							fontWeight: 600,
							lineHeight: 1.04,
							letterSpacing: -1.2,
						},
					},
					title,
				),
				subtitle
					? el('span', { style: { fontSize: 30, lineHeight: 1.3, color: MUTED } }, subtitle)
					: null,
			),
			el(
				'div',
				{
					style: {
						display: 'flex',
						alignItems: 'center',
						gap: 16,
						fontSize: badge.length > 26 ? 21 : 24,
					},
				},
				el(
					'span',
					{
						style: {
							padding: '10px 20px',
							borderRadius: 999,
							background: INK,
							color: PAPER,
							fontWeight: 600,
						},
					},
					badge,
				),
				el('span', { style: { color: MUTED } }, 'tryit.fun'),
			),
		),
		el(
			'div',
			{
				style: {
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					width: 400,
					height: 502,
					borderRadius: 48,
					background: theme ?? INK,
				},
			},
			el(
				'svg',
				{ width: 220, height: 220, viewBox: '8.5 8.5 47 47' },
				...MARK_TILES.map((at) => tile(at, theme ? INK : PAPER)),
				tile(MARK_KEYSTONE, MARK_AMBER),
			),
		),
	)

	fonts ??= loadFonts()
	const svg = await satori(markup, {
		width: 1200,
		height: 630,
		fonts: await fonts,
	})
	const png = (await renderAsync(svg, { font: { loadSystemFonts: false } })).asPng()
	return new Response(new Uint8Array(png), {
		headers: {
			'Content-Type': 'image/png',
			'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
			'X-Robots-Tag': 'noindex',
		},
	})
}

export async function serveSocialCard(request: Request, locale?: string) {
	if (locale && !isValidLocale(locale)) return new Response(null, { status: 404 })
	return renderSocialCard(request)
}
