import type { SVGProps } from 'react'
import type { GameIconShape } from './game-icon-art'

export { GAME_ICON_ART, type GameIconShape, type GameIconSlug } from './game-icon-art'

export type GameIconProps = SVGProps<SVGSVGElement> & { size?: number }

function renderShape(shape: GameIconShape, key: string) {
	const { accent = false, fill = false, thin = false, stroke, dash = false } = shape
	const style = {
		className: accent ? 'text-[var(--icon-accent,var(--color-accent-warm))]' : undefined,
		fill: fill ? 'currentColor' : 'none',
		strokeWidth: stroke ?? (thin ? 1 : 2),
		opacity: thin ? 0.35 : undefined,
		strokeDasharray: dash ? '2.6 2.4' : undefined,
	}
	switch (shape.kind) {
		case 'path':
			return <path key={key} d={shape.d} {...style} />
		case 'rect':
			return (
				<rect
					key={key}
					x={shape.x}
					y={shape.y}
					width={shape.width}
					height={shape.height}
					rx={shape.rx}
					{...style}
				/>
			)
		case 'circle':
			return <circle key={key} cx={shape.cx} cy={shape.cy} r={shape.r} {...style} />
		default:
			return null
	}
}

/**
 * Builds the icon component for one piece of art. The frame is fixed here so
 * the whole set cannot drift apart: 24px viewBox, currentColor stroke, round
 * caps, `aria-hidden` unless the caller overrides it.
 */
export function createGameIcon(shapes: readonly GameIconShape[]) {
	// biome-ignore lint/correctness/noComponentHookFactories: Every caller creates its icon once at module initialization, never during render.
	function GameIcon({ size = 24, className, ...props }: GameIconProps) {
		return (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 24 24"
				width={size}
				height={size}
				fill="none"
				stroke="currentColor"
				strokeWidth={2}
				strokeLinecap="round"
				strokeLinejoin="round"
				className={className}
				aria-hidden="true"
				{...props}
			>
				{shapes.map((shape, index) => renderShape(shape, String(index)))}
			</svg>
		)
	}
	return GameIcon
}
