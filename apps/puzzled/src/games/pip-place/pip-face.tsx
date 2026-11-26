/** @jsxImportSource solid-js */
import { For, Show } from 'solid-js'

const pipPatterns = [[], [4], [0, 8], [0, 4, 8], [0, 2, 6, 8], [0, 2, 4, 6, 8], [0, 2, 3, 5, 6, 8]]
const dotPositions = Array.from({ length: 9 }, (_, index) => index)

export function PipFace(props: { value: number }) {
	return (
		<Show when={props.value <= 6} fallback={<span aria-hidden="true">{props.value}</span>}>
			<span
				class="grid aspect-square w-7 max-w-4/5 grid-cols-3 grid-rows-3 place-items-center p-0.5"
				aria-hidden="true"
			>
				<For each={dotPositions}>
					{(dot) => (
						<span
							class="aspect-square w-3/4 rounded-full bg-current"
							classList={{ invisible: !pipPatterns[props.value]?.includes(dot) }}
						/>
					)}
				</For>
			</span>
		</Show>
	)
}
