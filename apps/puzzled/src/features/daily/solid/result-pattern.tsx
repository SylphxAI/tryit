/** @jsxImportSource solid-js */
import { For, Show } from 'solid-js'
import {
	FIVE_RESULT_TILE_COLORS,
	type ResultCardModel,
	type ResultCardStrings,
	resultPatternSummary,
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
												'background-color':
													props.model.gameSlug === 'word-guess'
														? FIVE_RESULT_TILE_COLORS[tile]
														: undefined,
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
