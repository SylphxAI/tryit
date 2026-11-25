/** @jsxImportSource solid-js */
import { Index } from 'solid-js'
import type { Translate } from '@/lib/i18n/translate'
import type { SpellingBeeState } from './types'

// Flat-top regular hexes: 80 units across the flats, with 6 units between them.
const hexHeight = 80
const hexWidth = (2 * hexHeight) / Math.sqrt(3)
const pitch = hexHeight + 6
const positions = [
	[0, -pitch],
	[(pitch * Math.sqrt(3)) / 2, -pitch / 2],
	[(pitch * Math.sqrt(3)) / 2, pitch / 2],
	[0, pitch],
	[(-pitch * Math.sqrt(3)) / 2, pitch / 2],
	[(-pitch * Math.sqrt(3)) / 2, -pitch / 2],
] as const
// Use a single coordinate box for the key geometry, with room for the key edges.
const combWidth = 250
const combHeight = 264

export function HexComb(
	props: Pick<SpellingBeeState, 'centerLetter' | 'outerLetters' | 'grading'> & {
		disabled: boolean
		onEdit: (key: string) => void
		t: Translate
	},
) {
	return (
		<fieldset
			aria-label={props.t('games.wordHive.name')}
			aria-busy={props.grading}
			class="hive-comb"
			style={{ 'aspect-ratio': `${combWidth} / ${combHeight}` }}
			dir="ltr"
		>
			<HexLetter
				letter={props.centerLetter}
				x={0}
				y={0}
				center
				disabled={props.disabled}
				label={`${props.centerLetter} · ${props.t('games.wordHive.rules.rule2')}`}
				onPress={props.onEdit}
			/>
			<Index each={props.outerLetters}>
				{(letter, index) => (
					<HexLetter
						letter={letter()}
						x={positions[index][0]}
						y={positions[index][1]}
						disabled={props.disabled}
						onPress={props.onEdit}
					/>
				)}
			</Index>
		</fieldset>
	)
}

export function HiveActions(props: {
	currentWord: string
	disabled: boolean
	onEdit: (key: string) => void
	onShuffle: () => void
	onSubmit: () => Promise<void>
	t: Translate
}) {
	return (
		<div class="grid grid-cols-3 gap-2">
			<button
				type="button"
				data-hive-key
				class="hive-action"
				aria-disabled={props.disabled || !props.currentWord}
				onClick={() => {
					if (props.currentWord) props.onEdit('Backspace')
				}}
			>
				{props.t('games.wordHive.delete')}
			</button>
			<button
				type="button"
				data-hive-key
				class="hive-action"
				aria-disabled={props.disabled}
				onClick={props.onShuffle}
			>
				{props.t('games.wordHive.shuffle')}
			</button>
			<button
				type="button"
				class="hive-action hive-action-enter"
				aria-disabled={props.disabled}
				onClick={props.onSubmit}
			>
				{props.t('games.wordHive.enter')}
			</button>
		</div>
	)
}

function HexLetter(props: {
	letter: string
	label?: string
	x: number
	y: number
	center?: boolean
	disabled: boolean
	onPress: (key: string) => void
}) {
	return (
		<div
			class="hive-key"
			classList={{ 'hive-key-center': props.center }}
			style={{
				left: `${50 + (props.x / combWidth) * 100}%`,
				top: `${50 + (props.y / combHeight) * 100}%`,
				width: `${(hexWidth / combWidth) * 100}%`,
				height: `${(hexHeight / combHeight) * 100}%`,
			}}
		>
			<button
				type="button"
				data-letter={props.letter}
				data-hive-key
				aria-label={props.label}
				aria-disabled={props.disabled}
				onClick={() => props.onPress(props.letter)}
			>
				<span lang="en" class="hive-key-face">
					{props.letter}
				</span>
			</button>
		</div>
	)
}
