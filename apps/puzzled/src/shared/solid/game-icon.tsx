/** @jsxImportSource solid-js */
import { Puzzle } from 'lucide-solid'
import { For, Show } from 'solid-js'
import { GAME_ICON_ART, type GameIconShape } from '@/shared/components/ui/game-icon-art'

const publicArt: Readonly<Partial<Record<string, readonly GameIconShape[]>>> = {
	...GAME_ICON_ART,
	crowns: GAME_ICON_ART.queens,
	duo: GAME_ICON_ART.tango,
}

export function GameIcon(props: { slug: string; size?: number; 'aria-hidden'?: 'true' }) {
	const shapes = () => (Object.hasOwn(publicArt, props.slug) ? publicArt[props.slug] : undefined)
	const size = () => props.size ?? 24
	return (
		<Show when={shapes()} fallback={<Puzzle size={size()} aria-hidden="true" />}>
			{(art) => (
				<svg
					width={size()}
					height={size()}
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<For each={art()}>{(shape) => <Shape shape={shape} />}</For>
				</svg>
			)}
		</Show>
	)
}

function Shape({ shape }: { shape: GameIconShape }) {
	const { accent, fill, thin, stroke, dash } = shape
	const style = {
		class: accent ? 'text-[var(--icon-accent,var(--color-accent-warm))]' : undefined,
		fill: fill ? 'currentColor' : 'none',
		opacity: thin ? 0.35 : undefined,
	}
	const width = stroke ?? (thin ? 1 : 2)
	const dasharray = dash ? '2.6 2.4' : undefined
	switch (shape.kind) {
		case 'path':
			return <path d={shape.d} stroke-width={width} stroke-dasharray={dasharray} {...style} />
		case 'rect':
			return (
				<rect
					x={shape.x}
					y={shape.y}
					width={shape.width}
					height={shape.height}
					rx={shape.rx}
					stroke-width={width}
					stroke-dasharray={dasharray}
					{...style}
				/>
			)
		case 'circle':
			return (
				<circle
					cx={shape.cx}
					cy={shape.cy}
					r={shape.r}
					stroke-width={width}
					stroke-dasharray={dasharray}
					{...style}
				/>
			)
	}
}
