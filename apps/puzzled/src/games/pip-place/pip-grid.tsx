/** @jsxImportSource solid-js */
import { For, Show } from 'solid-js'
import type { Translate } from '@/lib/i18n/translate'
import type { PipPlacePlay } from './create-pip-place-play'
import { PipFace } from './pip-face'
import {
	type Cell,
	cellKey,
	cellsEqual,
	type PipPlacePuzzleData,
	type PipPlaceRegion,
} from './types'

const regionColors = [
	'bg-orange-300/70 dark:bg-orange-500/40',
	'bg-sky-300/70 dark:bg-sky-500/40',
	'bg-lime-300/70 dark:bg-lime-500/40',
	'bg-violet-300/70 dark:bg-violet-500/40',
	'bg-amber-300/70 dark:bg-amber-500/40',
	'bg-rose-300/70 dark:bg-rose-500/40',
	'bg-teal-300/70 dark:bg-teal-500/40',
	'bg-fuchsia-300/70 dark:bg-fuchsia-500/40',
]

function badge(region: PipPlaceRegion | undefined) {
	if (region?.kind === 'sum') return region.value?.toString() ?? '—'
	if (region?.kind === 'equal') return region.value === null ? '=' : `=${region.value}`
	if (region?.kind === 'unequal') return '≠'
}

export function PipGrid(props: { data: PipPlacePuzzleData; play: PipPlacePlay; t: Translate }) {
	const { data, t } = props
	const {
		board,
		cells,
		playing,
		placed,
		placedPips,
		selectedFace,
		invalidCells,
		registerCell,
		touchCell,
		startDrag,
		endDrag,
		cancelDrag,
		move,
	} = props.play
	const regions = new Map(data.regions.map((region) => [region.id, region]))
	const regionStarts = new Map<number, Cell>()
	for (const cell of cells) if (!regionStarts.has(cell.id)) regionStarts.set(cell.id, cell)

	return (
		// biome-ignore lint/a11y/useSemanticElements: fieldset does not reliably size grid tracks in Chromium.
		<div
			role="group"
			aria-label={t('games.pipPlace.name')}
			dir="ltr"
			class="play-board grid gap-0.5 rounded-xl border border-border bg-background p-1"
			style={{
				'grid-template-columns': `repeat(${data.cols}, minmax(0, 1fr))`,
			}}
		>
			<For each={cells}>
				{(cell) => {
					const key = cellKey(cell)
					const invalid = () => invalidCells().has(key)
					const region = regions.get(cell.id)
					const marker = badge(region)
					const isStart = regionStarts.get(cell.id) === cell
					const pending = () => {
						const pendingCell = board().pending
						return pendingCell !== null && cellsEqual(pendingCell, cell)
					}
					const value = () => placedPips().get(key) ?? (pending() ? selectedFace()?.pa : undefined)
					return (
						<button
							ref={(node) => registerCell(key, node)}
							type="button"
							disabled={!playing()}
							aria-pressed={pending()}
							aria-invalid={invalid() || undefined}
							aria-label={[
								t('common.cellRow', { index: cell.row + 1 }),
								t('common.cellColumn', { index: cell.col + 1 }),
								marker && `${t('games.pipPlace.region')} ${cell.id + 1}: ${marker}`,
								value(),
							]
								.filter((part) => part !== undefined)
								.join(', ')}
							data-pip-cell={key}
							data-invalid={invalid() || undefined}
							class={
								'relative grid aspect-square min-w-0 select-none place-items-center rounded-sm border border-border/70 aria-pressed:not-data-invalid:border-accent-warm aria-pressed:not-data-invalid:ring-2 aria-pressed:not-data-invalid:ring-accent-warm aria-pressed:not-data-invalid:ring-offset-1 data-invalid:border-destructive data-invalid:ring-2 data-invalid:ring-inset data-invalid:ring-destructive focus-visible:z-20 focus-visible:outline-2 focus-visible:outline-foreground ' +
								regionColors[cell.id % regionColors.length]
							}
							classList={{ 'touch-none': !!selectedFace() && !placedPips().has(key) }}
							style={{ 'grid-row': String(cell.row + 1), 'grid-column': String(cell.col + 1) }}
							onClick={(event) => touchCell(cell, event)}
							onPointerDown={(event) => startDrag(event, cell)}
							onPointerUp={endDrag}
							onPointerCancel={cancelDrag}
							onLostPointerCapture={cancelDrag}
							onKeyDown={(event) => move(event, cell)}
						>
							<Show when={isStart && marker}>
								<span
									aria-hidden="true"
									class="absolute top-0.5 left-0.5 z-10 rounded px-0.5 text-[0.625rem] font-bold leading-none"
									classList={{
										'bg-background/90': !invalid(),
										'bg-destructive text-background': invalid(),
									}}
								>
									{marker}
									{invalid() ? ' !' : ''}
								</span>
							</Show>
							<Show when={value() !== undefined}>
								<PipFace value={value() ?? 0} />
							</Show>
						</button>
					)
				}}
			</For>
			<For each={placed()}>
				{(tile) => (
					<span
						aria-hidden="true"
						class="pointer-events-none z-10 rounded-md ring-2 ring-inset ring-foreground/50"
						style={{
							'grid-row':
								Math.min(tile.a.row, tile.b.row) +
								1 +
								' / span ' +
								(tile.a.row === tile.b.row ? 1 : 2),
							'grid-column':
								Math.min(tile.a.col, tile.b.col) +
								1 +
								' / span ' +
								(tile.a.col === tile.b.col ? 1 : 2),
						}}
					/>
				)}
			</For>
		</div>
	)
}
