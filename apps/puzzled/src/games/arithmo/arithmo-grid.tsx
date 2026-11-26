/** @jsxImportSource solid-js */
import { For, Show } from 'solid-js'
import type { createTranslator } from '@/lib/i18n/translate'
import { glyph, tones } from './arithmo-display'
import type { createArithmoPlay } from './create-arithmo-play'
import { type CharStatus, EQUATION_LENGTH, MAX_ATTEMPTS } from './types'

const rows = Array.from({ length: MAX_ATTEMPTS }, (_, i) => i)
const cols = Array.from({ length: EQUATION_LENGTH }, (_, i) => i)

type GridProps = Pick<
	ReturnType<typeof createArithmoPlay>,
	'graded' | 'outcome' | 'draft' | 'grading' | 'showTileHelp'
> & {
	t: ReturnType<typeof createTranslator>
	text: (key: string) => string
	feedbackText: (tile: CharStatus) => string | undefined
}

export function ArithmoGrid(props: GridProps) {
	const { graded, outcome, draft, grading, showTileHelp, t, text, feedbackText } = props
	return (
		<ol
			aria-label={text('name')}
			class="grid list-none gap-1"
			dir="ltr"
			data-arithmo-grid
			onPointerUp={showTileHelp}
		>
			<For each={rows}>
				{(row) => {
					const current = () => row === graded().length && !outcome()
					const attempt = () => graded()[row]
					return (
						<li class="grid grid-cols-8 gap-1" aria-current={current() ? 'step' : undefined}>
							<span class="sr-only">{t('common.cellRow', { index: row + 1 })}</span>
							<For each={cols}>
								{(col) => {
									const char = () => (attempt()?.guess ?? (current() ? draft() : ''))[col] ?? ''
									const tile = () => attempt()?.tiles[col] ?? 'empty'
									const activeSlot = () => current() && !grading() && col === draft().length
									const appearance = () =>
										activeSlot()
											? 'border-accent-warm bg-accent-warm-soft inset-ring-1 inset-ring-accent-warm/45'
											: `${tones[tile()]} ${current() && char() ? 'border-muted-foreground' : ''}`
									return (
										<span
											data-grade={tile()}
											data-active-slot={activeSlot() ? 'true' : undefined}
											class={`grid aspect-square place-items-center rounded-md border-2 font-display text-lg font-extrabold sm:text-xl ${appearance()}`}
										>
											{glyph(char())}
											<Show when={feedbackText(tile())}>
												{(label) => <span class="sr-only">: {label()}</span>}
											</Show>
										</span>
									)
								}}
							</For>
						</li>
					)
				}}
			</For>
		</ol>
	)
}
