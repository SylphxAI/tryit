/** @jsxImportSource solid-js */
import type { JSX } from 'solid-js'

// Literal SVG parts give server rendering and hydration identical node templates.
function Icon(props: { class?: string; children: JSX.Element }) {
	return (
		<svg
			class={props.class}
			aria-hidden="true"
			viewBox="0 0 24 24"
			width="24"
			height="24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			{props.children}
		</svg>
	)
}

export function ArrowRight(props: { class?: string }) {
	return (
		<Icon class={props.class}>
			<path d="M5 12h14" />
			<path d="m12 5 7 7-7 7" />
		</Icon>
	)
}

export function Check(props: { class?: string }) {
	return (
		<Icon class={props.class}>
			<path d="M20 6 9 17l-5-5" />
		</Icon>
	)
}

export function ChevronDown(props: { class?: string }) {
	return (
		<Icon class={props.class}>
			<path d="m6 9 6 6 6-6" />
		</Icon>
	)
}
