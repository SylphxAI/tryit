/** @jsxImportSource solid-js */
import type { Block, Direction } from './types'

export function SlideBlock(props: {
	block: Block
	gridWidth: number
	gridHeight: number
	label: string
	selected: boolean
	disabled: boolean
	onSelect: () => void
	onDrag: (direction: Direction) => void
}) {
	let drag: { id: number; x: number; y: number } | undefined
	let dragged = false
	function endDrag(event: PointerEvent & { currentTarget: HTMLButtonElement }) {
		if (drag?.id !== event.pointerId) return
		drag = undefined
		if (event.currentTarget.hasPointerCapture(event.pointerId))
			event.currentTarget.releasePointerCapture(event.pointerId)
	}
	return (
		<button
			type="button"
			class="absolute grid touch-none select-none place-items-center rounded-md border-2 font-display text-xl font-extrabold text-[#1a1712] motion-safe:transition-[left,top] motion-safe:duration-100"
			classList={{
				'bg-[#ff8a6b]': props.block.isTarget,
				'bg-[#62b8f2]': !props.block.isTarget,
				// Amber alone blends with both fills; the Ink gap separates them in either theme.
				'z-[1] border-accent-warm ring-2 ring-accent-warm ring-offset-2 ring-offset-on-accent':
					props.selected,
				'border-foreground/25': !props.selected,
			}}
			data-block-id={props.block.id}
			aria-label={props.label}
			aria-pressed={props.selected}
			disabled={props.disabled}
			style={{
				left: `calc(${(100 * props.block.x) / props.gridWidth}% + 2px)`,
				top: `calc(${(100 * props.block.y) / props.gridHeight}% + 2px)`,
				width: `calc(${(100 * props.block.width) / props.gridWidth}% - 4px)`,
				height: `calc(${(100 * props.block.height) / props.gridHeight}% - 4px)`,
			}}
			onPointerDown={(event) => {
				if (props.disabled || event.button !== 0 || !event.isPrimary) return
				dragged = false
				drag = { id: event.pointerId, x: event.clientX, y: event.clientY }
				event.currentTarget.setPointerCapture(event.pointerId)
			}}
			onPointerMove={(event) => {
				if (props.disabled || !drag || drag.id !== event.pointerId) return
				const dx = event.clientX - drag.x
				const dy = event.clientY - drag.y
				const threshold = (0.4 * (event.currentTarget.offsetWidth + 4)) / props.block.width
				if (Math.max(Math.abs(dx), Math.abs(dy)) <= threshold) return
				dragged = true
				drag = { id: event.pointerId, x: event.clientX, y: event.clientY }
				props.onDrag(
					Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up',
				)
			}}
			onPointerUp={endDrag}
			onPointerCancel={endDrag}
			onLostPointerCapture={endDrag}
			onClick={(event) => {
				if (!dragged || event.detail === 0) props.onSelect()
			}}
		>
			<span aria-hidden="true">{props.block.isTarget ? '★' : ''}</span>
		</button>
	)
}
