/** @jsxImportSource solid-js */
import { For } from 'solid-js'
import { inlineSegments } from './inline-segments'

/** Policy copy with its inline marks rendered; see inline-segments.ts. */
export function InlineText(props: { text: string }) {
	return (
		<For each={inlineSegments(props.text)}>
			{(segment) => {
				if (segment.kind === 'strong') return <strong>{segment.text}</strong>
				if (segment.kind === 'code') return <code>{segment.text}</code>
				if (segment.kind === 'link')
					return (
						<a class="underline" href={segment.href} rel="noopener" target="_blank">
							{segment.text}
						</a>
					)
				return segment.text
			}}
		</For>
	)
}
