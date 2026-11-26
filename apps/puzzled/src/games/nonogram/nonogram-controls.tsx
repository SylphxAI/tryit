/** @jsxImportSource solid-js */
import { Paintbrush, X } from 'lucide-solid'
import { createMemo, Show } from 'solid-js'
import type { Locale } from '@/lib/i18n/config'
import type { Translate } from '@/lib/i18n/translate'
import type { NonogramPlay } from './create-nonogram-play'

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
	const modeClass =
		'flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 font-semibold aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground'
	return (
		<div class="play-tools space-y-2" data-play-control>
			<div class="flex justify-center gap-2">
				<button
					type="button"
					class={modeClass}
					aria-pressed={mode() === 'filled'}
					disabled={locked()}
					onClick={() => setMode('filled')}
				>
					<Paintbrush size={16} aria-hidden="true" />
					{t('games.nonogram.fillMode')}
				</button>
				<button
					type="button"
					class={modeClass}
					aria-pressed={mode() === 'marked'}
					disabled={locked()}
					onClick={() => setMode('marked')}
				>
					<X size={16} aria-hidden="true" />
					{t('games.nonogram.markMode')}
				</button>
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
