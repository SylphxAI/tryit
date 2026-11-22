/** @jsxImportSource solid-js */
import { Puzzle } from 'lucide-solid'
import { For, Show } from 'solid-js'
import {
	GAME_ICON_ART,
	type GameIconShape,
	type GameIconSlug,
} from '@/shared/components/ui/game-icon-art'

export function GameIcon(props: { slug: string; size?: number; 'aria-hidden'?: 'true' }) {
	const key = () =>
		props.slug === 'crowns' ? 'queens' : props.slug === 'duo' ? 'tango' : props.slug
	const shapes = () =>
		Object.hasOwn(GAME_ICON_ART, key()) ? GAME_ICON_ART[key() as GameIconSlug] : undefined
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
		'stroke-width': stroke ?? (thin ? 1 : 2),
		opacity: thin ? 0.35 : undefined,
		'stroke-dasharray': dash ? '2.6 2.4' : undefined,
	}
	switch (shape.kind) {
		case 'path':
			return <path d={shape.d} {...style} />
		case 'rect':
			return (
				<rect
					x={shape.x}
					y={shape.y}
					width={shape.width}
					height={shape.height}
					rx={shape.rx}
					{...style}
				/>
			)
		case 'circle':
			return <circle cx={shape.cx} cy={shape.cy} r={shape.r} {...style} />
	}
}
