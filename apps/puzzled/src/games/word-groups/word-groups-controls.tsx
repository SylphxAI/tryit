/** @jsxImportSource solid-js */
import { Shuffle } from 'lucide-solid'
import { Index } from 'solid-js'
import type { Translate } from '@/lib/i18n/translate'
import type { WordGroupsPlay } from './create-word-groups-play'
import { MAX_MISTAKES, WORDS_PER_CATEGORY } from './types'
import { WordGroupsGrid } from './word-groups-grid'

const action =
	'min-h-12 rounded-xl border border-border px-3 text-xs font-semibold disabled:opacity-50 sm:px-5 sm:text-sm'

export function WordGroupsControls({ play, t }: { play: WordGroupsPlay; t: Translate }) {
	return (
		<>
			<fieldset class="min-w-0 space-y-3" disabled={play.grading()} aria-busy={play.grading()}>
				<legend class="sr-only">{t('games.wordGroups.name')}</legend>
				<WordGroupsGrid play={play} />
				<div class="flex flex-wrap justify-center gap-2">
					<button type="button" class={action} onClick={play.shuffle}>
						<Shuffle aria-hidden="true" class="mr-1 inline size-4" />
						{t('games.wordGroups.shuffle')}
					</button>
					<button
						type="button"
						class={action}
						disabled={!play.selected().length}
						onClick={play.deselect}
					>
						{t('games.wordGroups.deselect')}
					</button>
					<button
						type="button"
						class={`${action} board-submit`}
						data-ready={play.canSubmit() ? 'true' : undefined}
						onClick={play.grade}
					>
						{t('games.wordGroups.submit')}
					</button>
				</div>
			</fieldset>
			<output
				class="flex items-center justify-center gap-2"
				aria-label={t('games.wordGroups.mistakesRemaining', {
					remaining: play.left(),
					total: MAX_MISTAKES,
				})}
			>
				<span class="text-xs text-muted-foreground" aria-hidden="true">
					{t('games.wordGroups.mistakes')}:
				</span>
				<Index each={Array.from({ length: MAX_MISTAKES })}>
					{(_, i) => (
						<span
							aria-hidden="true"
							class="size-2.5 rounded-full"
							classList={{ 'bg-foreground/70': i < play.left(), 'bg-muted': i >= play.left() }}
						/>
					)}
				</Index>
			</output>
			<div class="min-h-6 text-sm" role="status">
				{play.grading()
					? t('common.syncing')
					: play.feedback() === 'error'
						? t('common.error')
						: play.feedback()
							? t(`games.wordGroups.messages.${play.feedback()}`, {
									count: WORDS_PER_CATEGORY - play.selected().length,
								})
							: ''}
			</div>
		</>
	)
}
