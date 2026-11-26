/** @jsxImportSource solid-js */
import { For, Index, Show } from 'solid-js'
import type { Translate } from '@/lib/i18n/translate'
import type { PipPlacePlay } from './create-pip-place-play'
import { PipFace } from './pip-face'
import type { PipPlaceRegionConflict } from './types'

function conflictReason(t: Translate, conflict: PipPlaceRegionConflict) {
	const region = conflict.regionId + 1
	const target = conflict.target
	switch (conflict.kind) {
		case 'sum':
			return t('games.pipPlace.conflicts.sum', {
				region,
				actual: conflict.actualSum,
				target: target ?? '—',
			})
		case 'equal':
			return target === null
				? t('games.pipPlace.conflicts.equal', { region })
				: t('games.pipPlace.conflicts.equalTarget', { region, target })
		case 'unequal':
			return t('games.pipPlace.conflicts.unequal', { region })
	}
}

export function PipActions(props: { play: PipPlacePlay; t: Translate }) {
	const { t } = props
	const { board, dispatch } = props.play
	return (
		<div class="pip-actions flex flex-wrap gap-2 text-sm">
			<button
				type="button"
				class="min-h-11 rounded-lg border border-border px-3 disabled:opacity-50"
				disabled={board().selectedTrayIndex === null}
				onClick={() => dispatch({ type: 'ROTATE' })}
			>
				{t('games.pipPlace.rotate')}
			</button>
			<button
				type="button"
				class="min-h-11 rounded-lg border border-border px-3 disabled:opacity-50"
				disabled={!board().past.length}
				onClick={() => dispatch({ type: 'UNDO' })}
			>
				{t('games.pipPlace.undo')}
			</button>
			<button
				type="button"
				class="min-h-11 rounded-lg border border-border px-3 disabled:opacity-50"
				disabled={!board().past.length && board().selectedTrayIndex === null}
				onClick={() => dispatch({ type: 'RESET' })}
			>
				{t('common.reset')}
			</button>
		</div>
	)
}

export function PipTray(props: { play: PipPlacePlay; t: Translate }) {
	const { t } = props
	const { board, details, registerTile, selectTray, wrong } = props.play
	return (
		<>
			<div
				class="play-tools flex flex-wrap justify-center gap-2 rounded-xl data-highlight:ring-2 data-highlight:ring-accent-warm data-highlight:ring-offset-2"
				data-pip-tray
				data-highlight={board().cue === 'selectDomino' || undefined}
				dir="ltr"
			>
				<Index each={board().tray}>
					{(face, index) => (
						<button
							ref={(node) => registerTile(index, node)}
							type="button"
							aria-pressed={board().selectedTrayIndex === index}
							aria-label={t('games.pipPlace.tile', { a: face().pa, b: face().pb })}
							data-pip-tile={`${face().pa}-${face().pb}`}
							class="flex min-h-11 min-w-12 items-center justify-center rounded-lg border border-border bg-background px-1 shadow-sm aria-pressed:border-accent-warm aria-pressed:bg-accent-warm-soft aria-pressed:ring-2 aria-pressed:ring-accent-warm/45"
							onClick={(event) => selectTray(index, event)}
						>
							<PipFace value={face().pa} />
							<span class="h-6 w-px bg-border" aria-hidden="true" />
							<PipFace value={face().pb} />
						</button>
					)}
				</Index>
			</div>
			<div class="pip-feedback">
				<div role="status" class="text-center text-sm font-semibold text-foreground">
					<Show when={board().cue}>{(cue) => <p>{t(`games.pipPlace.${cue()}`)}</p>}</Show>
				</div>
				<div role="status" class="space-y-1 text-center text-sm font-semibold text-destructive">
					<For each={details().regions}>{(conflict) => <p>{conflictReason(t, conflict)}</p>}</For>
					<Show when={!wrong() && board().tray.length === 0}>
						<p>
							{t(
								details().regions.length
									? 'games.pipPlace.conflicts.pickUp'
									: 'games.pipPlace.rejected',
							)}
						</p>
					</Show>
				</div>
				<Show when={wrong()}>
					<p role="alert" class="text-center text-sm font-semibold text-destructive">
						{t('games.pipPlace.rejected')}
					</p>
				</Show>
			</div>
		</>
	)
}
