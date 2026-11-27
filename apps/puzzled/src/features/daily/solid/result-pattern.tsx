/** @jsxImportSource solid-js */
import { For, Show } from 'solid-js'
import {
	type ResultCardModel,
	type ResultCardStrings,
	resultPatternSummary,
	resultTileFixedColor,
} from '@/features/daily/lib/result-card'

export function ResultPattern(props: { model: ResultCardModel; strings: ResultCardStrings }) {
	return (
		<Show when={props.model.pattern}>
			{(pattern) => (
				<div
					class="result-preview"
					role="img"
					aria-label={resultPatternSummary(pattern(), props.strings)}
				>
					<For each={pattern()}>
						{(row) => (
							<div class="result-preview-row" aria-hidden="true">
								<For each={row}>
									{(tile) => (
										<span
											data-tile={tile}
											style={{
												'background-color': resultTileFixedColor(props.model.gameSlug, tile),
											}}
										/>
									)}
								</For>
							</div>
						)}
					</For>
				</div>
			)}
		</Show>
	)
}
