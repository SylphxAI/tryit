/** @jsxImportSource solid-js */
import { For, onCleanup, onMount, Show } from 'solid-js'
import type { CryptogramCopy, CryptogramPlay } from './create-cryptogram-play'
import type { CryptogramPuzzleData } from './types'

const keyboardRows = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'] as const

type KeyboardInput = Pick<
	CryptogramPlay,
	'selected' | 'editable' | 'canType' | 'typeLetter' | 'clear'
>

export function mountCryptogramKeyboard(
	data: () => CryptogramPuzzleData,
	{
		selected,
		editable,
		canType,
		typeLetter,
		clear,
		select,
		isRevealed,
	}: KeyboardInput & Pick<CryptogramPlay, 'select' | 'isRevealed'>,
) {
	onMount(() => {
		select(
			Array.from(data().encryptedText).find(
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
}

export function CryptogramKeyRows(props: {
	play: KeyboardInput & Pick<CryptogramPlay, 'guesses' | 'state'>
	copy: CryptogramCopy
}) {
	const { guesses, editable, selected, canType, state, typeLetter, clear } = props.play
	const copy = props.copy
	return (
		<For each={keyboardRows}>
			{(row, index) => (
				<div class="grid auto-cols-[calc((100%-2.25rem)/10)] grid-flow-col justify-center gap-1">
					<For each={Array.from(row)}>
						{(letter) => (
							<button
								type="button"
								class="min-h-11! min-w-0! touch-manipulation rounded-md border border-border bg-background font-semibold hover:bg-muted disabled:opacity-50 data-used:bg-muted"
								data-used={Object.values(guesses()).includes(letter) || undefined}
								disabled={
									!editable() ||
									(selected() !== null &&
										(!canType() ||
											state().revealedLetters.some((key) => guesses()[key] === letter)))
								}
								onClick={() => typeLetter(letter)}
							>
								{letter}
							</button>
						)}
					</For>
					<Show when={index() === keyboardRows.length - 1}>
						<button
							type="button"
							class="col-span-3 min-h-11! min-w-0! touch-manipulation rounded-md border border-border bg-muted px-1 text-xs font-semibold hover:bg-background disabled:opacity-50 sm:text-sm"
							disabled={!canType()}
							onClick={clear}
						>
							{copy('clear')}
						</button>
					</Show>
				</div>
			)}
		</For>
	)
}
