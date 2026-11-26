/** @jsxImportSource solid-js */
import { For, Show } from 'solid-js'
import type { CryptogramCopy, CryptogramPlay } from './create-cryptogram-play'

export function CryptogramQuoteWords(props: {
	encryptedText: string
	play: Pick<CryptogramPlay, 'guesses' | 'selected' | 'isRevealed' | 'editable' | 'select'>
	copy: CryptogramCopy
}) {
	const { guesses, selected, isRevealed, editable, select } = props.play
	const copy = props.copy
	return (
		<For each={props.encryptedText.split(/\s+/)}>
			{(word) => (
				<div class="flex max-w-full flex-wrap gap-0.5">
					<For each={Array.from(word)}>
						{(char) => (
							<Show when={/^[A-Z]$/.test(char)} fallback={<span class="self-center">{char}</span>}>
								<button
									type="button"
									class="flex h-12 min-w-9 flex-col items-center justify-center rounded-md border border-border bg-background hover:not-aria-pressed:bg-muted aria-pressed:border-accent-warm aria-pressed:bg-accent-warm-soft aria-pressed:ring-2 aria-pressed:ring-accent-warm/45 data-revealed:not-aria-pressed:bg-muted"
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
	)
}
