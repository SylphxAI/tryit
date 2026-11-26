/** @jsxImportSource solid-js */
import { Lightbulb, RotateCcw } from 'lucide-solid'
import { createMemo, Show } from 'solid-js'
import { BoardFinish, createBoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { createTranslator } from '@/lib/i18n/translate'
import { type CryptogramCopy, createCryptogramPlay, cryptogramSlug } from './create-cryptogram-play'
import { CryptogramKeyRows, mountCryptogramKeyboard } from './cryptogram-keyboard'
import { CryptogramQuoteWords } from './cryptogram-quote'
import { parseCryptogramClientPayload } from './parse-client'
import type { CryptogramPuzzleData } from './types'

export default function CryptogramBoard(props: DailyBoardProps) {
	const t = createTranslator(props.locale)
	const data = createMemo(() => {
		try {
			return parseCryptogramClientPayload(props.puzzle.puzzleData)
		} catch {
			return null
		}
	})
	return (
		<Show when={data()} keyed fallback={<p role="alert">{t('daily.unavailableTitle')}</p>}>
			{(puzzle) => <Cipher {...props} data={puzzle} />}
		</Show>
	)
}

function Cipher(props: DailyBoardProps & { data: CryptogramPuzzleData }) {
	const t = createTranslator(props.locale)
	const copy: CryptogramCopy = (key, values) => t(`games.cryptogram.${key}`, values)
	const finish = createBoardFinish(props, cryptogramSlug)
	const play = createCryptogramPlay(props, finish, copy)
	const {
		filled,
		guesses,
		canHint,
		hint,
		remaining,
		playing,
		reset,
		state,
		gradeFailed,
		retry,
		hintFailed,
		gradePending,
		hintPending,
		notice,
	} = play
	mountCryptogramKeyboard(() => props.data, play)

	return (
		<section class="flex w-full flex-col gap-3" aria-label={copy('name')} data-cryptogram-board>
			<div class="flex min-h-11 flex-wrap items-center justify-between gap-2 text-sm">
				<p aria-live="polite">
					{copy('progress', { filled: filled(), total: Object.keys(guesses()).length })}
				</p>
				<div class="flex flex-wrap gap-1" data-play-control>
					<button
						type="button"
						class="min-h-11 px-2 font-semibold disabled:opacity-50"
						disabled={!canHint()}
						onClick={() => void hint()}
					>
						<Lightbulb size={16} class="me-1 inline" aria-hidden="true" />
						{copy('hint', { count: remaining() })}
					</button>
					<button
						type="button"
						class="min-h-11 px-2 font-semibold disabled:opacity-50"
						disabled={!playing()}
						onClick={reset}
					>
						<RotateCcw size={16} class="me-1 inline" aria-hidden="true" />
						{t('common.reset')}
					</button>
				</div>
			</div>
			<Show when={props.data.author}>
				<p class="rounded-lg bg-muted p-2 text-center text-sm">
					{copy('author', { name: props.data.author })}
				</p>
			</Show>
			<fieldset class="min-w-0" aria-label={copy('highlight')} data-cipher-quote dir="ltr">
				<div class="flex flex-wrap justify-center gap-x-3 gap-y-2 p-0.5">
					<CryptogramQuoteWords encryptedText={props.data.encryptedText} play={play} copy={copy} />
				</div>
			</fieldset>
			<Show when={state().lastCheckWrong}>
				<p role="status" class="text-sm text-destructive">
					{copy('wrong')}
				</p>
			</Show>
			<Show when={gradeFailed()}>
				<p role="alert" class="text-sm">
					{t('common.error')}{' '}
					<button type="button" class="min-h-11 underline" onClick={retry}>
						{t('common.retry')}
					</button>
				</p>
			</Show>
			<Show when={hintFailed()}>
				<p role="alert">{t('common.error')}</p>
			</Show>
			<Show when={gradePending() || hintPending()}>
				<p role="status">{t('common.syncing')}</p>
			</Show>
			<p role="status" class="text-center text-sm empty:sr-only">
				{notice()}
			</p>
			{/* Ten equal columns on each row; Clear occupies the last three on the bottom. */}
			<div
				class="mx-auto grid w-full max-w-lg gap-1"
				dir="ltr"
				data-cipher-keyboard
				data-play-control
			>
				<CryptogramKeyRows play={play} copy={copy} />
			</div>
			<BoardFinish finish={finish} locale={props.locale} message={copy('complete')} />
		</section>
	)
}
