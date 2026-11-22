/** @jsxImportSource solid-js */
import { createUniqueId, type JSX } from 'solid-js'
import { cn } from '@/lib/utils'

type ProgressRingProps = {
	/** Completed units. */
	value: number
	/** Total units; zero renders an empty ring without dividing by zero. */
	max: number
	/** Outer diameter in CSS pixels. */
	size?: number
	strokeWidth?: number
	className?: string
	/** Rendered in the centre; defaults to the "done/total" count. */
	label?: JSX.Element
	/** Accessible description of the ring. */
	title: string
}

/**
 * Small SVG progress ring used by the home hero and the stats console.
 *
 * It carries a real accessible value rather than a decorative arc, and the
 * visual fill follows the brand gradient.
 */
export function ProgressRing({
	value,
	max,
	size = 92,
	strokeWidth = 8,
	className,
	label,
	title,
}: ProgressRingProps) {
	const safeMax = Math.max(max, 1)
	const ratio = Math.min(Math.max(value / safeMax, 0), 1)
	const radius = (size - strokeWidth) / 2
	const circumference = 2 * Math.PI * radius
	const dash = circumference * ratio
	const gradientId = `progress-ring-${createUniqueId()}`

	return (
		<div
			class={cn('relative inline-flex items-center justify-center', className)}
			style={{ width: `${size}px`, height: `${size}px` }}
			role="img"
			aria-label={title}
		>
			<svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
				<defs>
					<linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
						{/* Brand tokens, so the ring follows the theme instead of a frozen hex. */}
						<stop offset="0%" stop-color="var(--color-primary)" />
						<stop offset="100%" stop-color="var(--color-secondary)" />
					</linearGradient>
				</defs>
				<circle
					cx={size / 2}
					cy={size / 2}
					r={radius}
					fill="none"
					stroke-width={strokeWidth}
					class="stroke-muted"
				/>
				<circle
					cx={size / 2}
					cy={size / 2}
					r={radius}
					fill="none"
					stroke-width={strokeWidth}
					stroke-linecap="round"
					stroke={`url(#${gradientId})`}
					stroke-dasharray={`${dash} ${circumference - dash}`}
					transform={`rotate(-90 ${size / 2} ${size / 2})`}
					// Class-based so `motion-reduce` can switch the fill animation off.
					class="transition-[stroke-dasharray] duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
				/>
			</svg>
			<span class="absolute inset-0 flex flex-col items-center justify-center">
				{label ?? (
					<span class="font-display text-lg tnum">
						{value}
						<span class="text-muted-foreground">/{max}</span>
					</span>
				)}
			</span>
		</div>
	)
}
