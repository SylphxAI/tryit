/** @jsxImportSource solid-js */
import { Check, Paintbrush, X } from 'lucide-solid'
import { createMemo, createUniqueId, For, Show } from 'solid-js'
import type { Locale } from '@/lib/i18n/config'
import type { Translate } from '@/lib/i18n/translate'
import type { NonogramPlay } from './create-nonogram-play'

const brushes = [
	{
		ink: 'filled',
		Icon: Paintbrush,
		label: 'games.nonogram.fillMode',
		cue: 'games.nonogram.fillCue',
	},
	{ ink: 'marked', Icon: X, label: 'games.nonogram.markMode', cue: 'games.nonogram.markCue' },
] as const

type ControlsPlay = Pick<
	NonogramPlay,
	'mode' | 'setMode' | 'locked' | 'canUndo' | 'undo' | 'startOver' | 'conflicts'
>

export function NonogramControls(props: { locale: Locale; play: ControlsPlay; t: Translate }) {
	const t = props.t
	const { mode, setMode, locked, canUndo, undo, startOver, conflicts } = props.play
	const listFormat = new Intl.ListFormat(props.locale)
	const conflictMessage = createMemo(() => {
		const { rows, columns } = conflicts()
		const lines = [
			...rows.map((row) => t('common.cellRow', { index: row + 1 })),
			...columns.map((col) => t('common.cellColumn', { index: col + 1 })),
		]
		return lines.length
			? t('games.nonogram.messages.clueMismatch', {
					count: lines.length,
					lines: listFormat.format(lines),
				})
			: ''
	})
	const brushId = createUniqueId()
	return (
		<div class="play-tools space-y-2" data-play-control>
			<div class="mx-auto grid max-w-sm grid-cols-2 gap-2">
				<For each={brushes}>
					{({ ink, Icon, label, cue }) => {
						const descriptionId = `${brushId}-${ink}`
						return (
							<button
								type="button"
								class="group min-h-12 min-w-0 rounded-xl border border-border px-2 py-1 text-start leading-tight aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
								aria-label={t(label)}
								aria-describedby={locked() ? undefined : descriptionId}
								aria-pressed={mode() === ink}
								disabled={locked()}
								onClick={() => setMode(ink)}
							>
								<span class="flex items-center gap-1.5 font-semibold">
									<Icon size={16} class="shrink-0" aria-hidden="true" />
									{t(label)}
									<Check
										size={16}
										class="invisible ms-auto shrink-0 group-aria-pressed:visible"
										aria-hidden="true"
									/>
								</span>
								<span
									id={descriptionId}
									class="mt-0.5 block text-xs leading-tight"
									classList={{ invisible: locked() }}
								>
									{t(cue)}
								</span>
							</button>
						)
					}}
				</For>
			</div>
			<Show when={!locked()}>
				<div class="flex flex-wrap items-center justify-center gap-2">
					<button
						type="button"
						class="min-h-12 rounded-xl border border-border px-3 font-semibold disabled:opacity-50"
						disabled={!canUndo()}
						onClick={undo}
					>
						{t('games.nonogram.undo')}
					</button>
					<button
						type="button"
						class="min-h-12 rounded-xl border border-border px-3 font-semibold"
						onClick={startOver}
					>
						{t('games.nonogram.startOver')}
					</button>
				</div>
			</Show>
			<p
				role="status"
				class="min-h-5 h-10 overflow-y-auto text-center text-sm leading-5 font-semibold text-destructive"
			>
				{conflictMessage()}
			</p>
		</div>
	)
}
