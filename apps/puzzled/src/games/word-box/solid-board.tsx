/** @jsxImportSource solid-js */
import { RotateCcw } from 'lucide-solid'
import { createMemo, For, Show } from 'solid-js'
import { BoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { createTranslator } from '@/lib/i18n/translate'
import { createWordBoxPlay } from './create-word-box-play'
import { FrameGrid } from './frame-grid'
import { parseWordBoxClientPayload } from './parse-client'
import type { LetterBox } from './types'
import { WordBoxEntry } from './word-box-entry'

export default function WordBoxBoard(props: DailyBoardProps) {
	const t = createTranslator(props.locale)
	const data = createMemo(() => {
		try {
			return parseWordBoxClientPayload(props.puzzle.puzzleData)
		} catch {
			return null
		}
	})
	return (
		<Show when={data()} keyed fallback={<p role="alert">{t('daily.unavailableTitle')}</p>}>
			{(puzzle) => <Frame {...props} box={puzzle.box} />}
		</Show>
	)
}

function Frame(props: DailyBoardProps & { box: LetterBox }) {
	const t = createTranslator(props.locale)
	const copy = (key: string, values?: Record<string, string | number>) =>
		t(`games.wordBox.${key}`, values)
	const box = props.box
	const play = createWordBoxPlay(props, box)
	const {
		finish,
		used,
		total,
		playable,
		reset,
		confirmReset,
		cancelReset,
		checking,
		words,
		current,
		required,
		error,
		add,
		addWord,
		backspace,
		undoWord,
		setDraft,
	} = play

	return (
		<section
			class="mx-auto flex w-full max-w-md flex-col gap-3"
			aria-label={copy('name')}
			data-word-box-board
		>
			<div class="flex min-h-11 flex-wrap items-center justify-between gap-x-3 text-sm">
				<p aria-live="polite">{copy('progress', { used: used().size, total })}</p>
				<button
					type="button"
					data-play-control
					class="min-h-11 px-2 font-semibold disabled:opacity-50"
					disabled={!playable()}
					onClick={(event) => {
						event.currentTarget.focus({ preventScroll: true })
						reset()
					}}
					onBlur={cancelReset}
					onKeyDown={(event) => {
						if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault()
						if (event.key === 'Escape' && confirmReset()) {
							event.preventDefault()
							cancelReset()
						}
					}}
				>
					<RotateCcw size={16} class="me-1 inline" aria-hidden="true" />
					<span aria-live="polite">
						{confirmReset() ? copy('confirmReset') : t('common.reset')}
					</span>
				</button>
			</div>
			<fieldset class="space-y-3" aria-busy={checking()}>
				<legend class="sr-only">{copy('input')}</legend>
				<FrameGrid
					box={box}
					used={used()}
					words={words()}
					current={current()}
					required={required()}
					playing={finish.state() === 'playing'}
					playable={playable()}
					add={add}
				/>
				<WordBoxEntry
					inputLabel={copy('input')}
					backspaceLabel={copy('backspace')}
					submitLabel={copy('enter')}
					current={current()}
					required={required()}
					playable={playable()}
					setDraft={setDraft}
					backspace={backspace}
					addWord={addWord}
				/>
			</fieldset>
			<Show when={required()}>
				{(letter) => (
					<p id="frame-next-letter" data-play-control class="text-center text-sm">
						{copy('nextLetter', { letter: letter() })}
					</p>
				)}
			</Show>
			<Show when={error()}>
				{(reason) => (
					<p role="status" class="text-center text-sm text-destructive">
						{copy(reason())}
					</p>
				)}
			</Show>
			<Show when={words().length}>
				<ol aria-label={copy('chain')} class="flex flex-wrap justify-center gap-2" dir="ltr">
					<For each={words()}>
						{(word) => <li class="rounded-lg bg-muted px-3 py-1 font-bold">{word}</li>}
					</For>
				</ol>
				<button
					type="button"
					data-play-control
					class="min-h-11 self-center px-2 text-sm font-semibold underline disabled:opacity-50"
					disabled={!playable() || Boolean(current())}
					onClick={undoWord}
				>
					{copy('undo')}
				</button>
			</Show>
			<BoardFinish finish={finish} locale={props.locale} message={copy('complete')} />
		</section>
	)
}
