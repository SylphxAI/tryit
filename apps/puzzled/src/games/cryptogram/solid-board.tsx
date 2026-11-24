/** @jsxImportSource solid-js */
import { Lightbulb, RotateCcw } from 'lucide-solid'
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { BoardFinish, createBoardFinish, type DailyBoardProps } from '@/games/shared/solid/finish'
import { checkGuess } from '@/lib/connect/puzzle-client'
import { createTranslator } from '@/lib/i18n/translate'
import { triggerHaptic } from '@/shared/hooks/use-haptic'
import { parseCryptogramClientPayload } from './parse-client'
import {
	type CryptogramAction,
	createCryptogramState,
	cryptogramReducer,
	isFullyFilled,
} from './state'
import { ALPHABET, type CryptogramPuzzleData } from './types'

const slug = 'cryptogram'

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
	const copy = (key: string, values?: Record<string, string | number>) =>
		t(`games.cryptogram.${key}`, values)
	const finish = createBoardFinish(props, slug)
	const [state, setState] = createSignal(createCryptogramState(props.data))
	const [hintPending, setHintPending] = createSignal(false)
	const [gradePending, setGradePending] = createSignal(false)
	const [gradeFailed, setGradeFailed] = createSignal(false)
	const [hintFailed, setHintFailed] = createSignal(false)
	const [notice, setNotice] = createSignal('')
	const [retryCount, retryGrade] = createSignal(0)
	const dispatch = (action: CryptogramAction) =>
		setState((previous) => cryptogramReducer(previous, action, props.data))
	const guesses = createMemo(() => state().guesses)
	const playing = createMemo(() => state().gameStatus === 'playing' && finish.state() === 'playing')
	const editable = () => playing() && !hintPending()
	let hintVersion = 0
	let noticeTimer: ReturnType<typeof setTimeout> | undefined
	onCleanup(() => {
		hintVersion++
		clearTimeout(noticeTimer)
	})
	const grade = (guess: unknown) =>
		checkGuess({
			gameSlug: slug,
			guess,
			puzzleId: props.puzzle.puzzleId,
			puzzleDate: props.puzzle.puzzleDate,
			difficulty: props.difficulty,
		})

	createEffect(() => {
		retryCount()
		const submitted = guesses()
		setGradeFailed(false)
		if (!editable() || !isFullyFilled(submitted)) {
			setGradePending(false)
			return
		}
		setGradePending(true)
		let stale = false
		onCleanup(() => {
			stale = true
		})
		void grade({ guesses: submitted }).then(
			(answer) => {
				if (stale || guesses() !== submitted || !editable()) return
				setGradePending(false)
				const solved = (answer as { solved?: unknown } | null)?.solved
				if (typeof solved !== 'boolean') {
					setGradeFailed(true)
					return
				}
				if (solved) finish.finish({ guesses: submitted, hintsUsed: state().hintsUsed })
				dispatch({ type: 'CHECKED', guesses: submitted, solved })
			},
			() => {
				if (stale) return
				setGradePending(false)
				setGradeFailed(true)
			},
		)
	})

	async function hint() {
		if (!canHint()) return
		const version = ++hintVersion
		setHintPending(true)
		setHintFailed(false)
		try {
			const answer = (await grade({
				hint: true,
				guesses: guesses(),
				revealed: state().revealedLetters,
			})) as { encrypted?: unknown; letter?: unknown } | null
			if (version !== hintVersion || !playing()) return
			if (typeof answer?.encrypted === 'string' && typeof answer.letter === 'string') {
				const used = state().hintsUsed
				dispatch({ type: 'REVEAL', encryptedLetter: answer.encrypted, letter: answer.letter })
				setHintFailed(used === state().hintsUsed)
			} else setHintFailed(true)
		} catch {
			if (version === hintVersion) setHintFailed(true)
		} finally {
			if (version === hintVersion) setHintPending(false)
		}
	}

	const filled = createMemo(() => Object.values(guesses()).filter(Boolean).length)
	const remaining = () => props.data.maxHints - state().hintsUsed
	const canHint = () => editable() && !gradePending() && remaining() > 0
	const selected = () => state().selectedLetter
	const isRevealed = (letter: string) => state().revealedLetters.includes(letter)
	const canType = () => {
		const letter = selected()
		return editable() && letter !== null && !isRevealed(letter)
	}
	function showNotice(message = '') {
		clearTimeout(noticeTimer)
		setNotice(message)
		if (message) noticeTimer = setTimeout(() => setNotice(''), 2500)
	}
	function select(letter: string | null) {
		showNotice()
		dispatch({ type: 'SELECT_LETTER', encryptedLetter: letter })
	}
	function typeLetter(letter: string) {
		if (!editable()) return
		const target = selected()
		if (!target) {
			showNotice(copy('selectFirst'))
			return
		}
		if (!canType()) return
		const previous = state()
		const from = Object.keys(previous.guesses).find(
			(key) => key !== target && previous.guesses[key] === letter,
		)
		const next = dispatch({ type: 'SET_GUESS', encryptedLetter: target, guessedLetter: letter })
		if (next === previous) return
		showNotice(from ? copy('letterMoved', { letter, from, to: target }) : '')
		triggerHaptic('light')
	}
	function clear() {
		const target = selected()
		if (target && canType()) {
			showNotice()
			dispatch({ type: 'CLEAR_GUESS', encryptedLetter: target })
		}
	}
	function reset() {
		if (!playing()) return
		hintVersion++
		setHintPending(false)
		setHintFailed(false)
		showNotice()
		dispatch({ type: 'RESET' })
	}
	onMount(() => {
		select(
			Array.from(props.data.encryptedText).find(
				(letter) => /^[A-Z]$/.test(letter) && !isRevealed(letter),
			) ?? null,
		)
		const handleKey = (event: KeyboardEvent) => {
			if (
				event.defaultPrevented ||
				event.altKey ||
				event.ctrlKey ||
				event.metaKey ||
				event.isComposing ||
				(event.target instanceof Element &&
					event.target.closest('input, textarea, select, [contenteditable], [role="dialog"]'))
			)
				return
			if (event.key === 'Escape' && selected()) {
				select(null)
			} else if (canType() && (event.key === 'Backspace' || event.key === 'Delete')) clear()
			else if (editable() && /^[a-z]$/i.test(event.key)) typeLetter(event.key.toUpperCase())
			else return
			event.preventDefault()
		}
		window.addEventListener('keydown', handleKey)
		onCleanup(() => window.removeEventListener('keydown', handleKey))
	})

	return (
		<section class="flex w-full flex-col gap-3" aria-label={copy('name')} data-cryptogram-board>
			<div class="flex flex-wrap items-center justify-between gap-2 text-sm">
				<p aria-live="polite">
					{copy('progress', { filled: filled(), total: Object.keys(guesses()).length })}
				</p>
				<div class="flex flex-wrap gap-1">
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
			<div class="flex flex-wrap justify-center gap-x-3 gap-y-2" dir="ltr">
				<For each={props.data.encryptedText.split(/\s+/)}>
					{(word) => (
						<div class="flex max-w-full flex-wrap gap-0.5">
							<For each={Array.from(word)}>
								{(char) => (
									<Show
										when={/^[A-Z]$/.test(char)}
										fallback={<span class="self-center">{char}</span>}
									>
										<button
											type="button"
											class="flex h-12 min-w-9 flex-col items-center justify-center rounded-md border border-border bg-background hover:bg-muted aria-pressed:border-primary aria-pressed:ring-2 aria-pressed:ring-primary data-revealed:bg-muted"
											aria-label={copy('cipherLetter', {
												cipher: char,
												guess: guesses()[char] || copy('blank'),
											})}
											aria-pressed={selected() === char}
											data-cipher-letter={char}
											data-revealed={isRevealed(char) || undefined}
											disabled={!editable() || isRevealed(char)}
											onClick={() => select(char)}
										>
											<span class="font-bold">{guesses()[char] || '_'}</span>
											<span class="text-xs text-muted-foreground">{char}</span>
										</button>
									</Show>
								)}
							</For>
						</div>
					)}
				</For>
			</div>
			<Show when={state().lastCheckWrong}>
				<p role="status" class="text-sm text-destructive">
					{copy('wrong')}
				</p>
			</Show>
			<Show when={gradeFailed()}>
				<p role="alert" class="text-sm">
					{t('common.error')}{' '}
					<button type="button" class="min-h-11 underline" onClick={() => retryGrade((n) => n + 1)}>
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
			<div class="flex flex-wrap justify-center gap-1" dir="ltr" data-cipher-keyboard>
				<For each={Array.from(ALPHABET)}>
					{(letter) => (
						<button
							type="button"
							class="min-h-11 min-w-9 rounded-md border border-border bg-background font-semibold hover:bg-muted disabled:opacity-50 data-used:bg-muted"
							data-used={Object.values(guesses()).includes(letter) || undefined}
							disabled={
								!editable() ||
								(selected() !== null &&
									(!canType() || state().revealedLetters.some((key) => guesses()[key] === letter)))
							}
							onClick={() => typeLetter(letter)}
						>
							{letter}
						</button>
					)}
				</For>
				<button
					type="button"
					class="min-h-11 px-2 text-sm font-semibold underline disabled:opacity-50"
					disabled={!canType()}
					onClick={clear}
				>
					{copy('clear')}
				</button>
			</div>
			<BoardFinish finish={finish} locale={props.locale} message={copy('complete')} />
		</section>
	)
}
