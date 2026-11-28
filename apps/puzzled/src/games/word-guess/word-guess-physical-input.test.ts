import { expect, test } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { createWordGuessKeyHandler } from './word-guess-physical-input'

test('Five submits a full guess from a focused tile without hijacking other controls', async () => {
	GlobalRegistrator.register()
	try {
		const tile = document.createElement('button')
		tile.dataset.fiveInputHint = ''
		const key = document.createElement('button')
		const link = document.createElement('a')
		document.body.append(tile, key, link)
		let draft = ''
		let submissions = 0
		const handle = createWordGuessKeyHandler(
			() => false,
			async () => {
				submissions++
			},
			(letter) => {
				draft += letter
			},
			() => draft.length === 5,
		)
		window.addEventListener('keydown', handle)
		const press = (target: HTMLElement, key: string, repeat = false) => {
			const event = new KeyboardEvent('keydown', { key, repeat, bubbles: true, cancelable: true })
			target.dispatchEvent(event)
			return event.defaultPrevented
		}

		expect(press(tile, 'Enter')).toBe(false) // Native tile hint before typing.
		for (const letter of 'charm') expect(press(tile, letter)).toBe(true)
		expect(draft).toBe('CHARM')
		expect(press(key, 'Enter')).toBe(false) // Native keypad click, including the Enter key.
		expect(press(link, 'Enter')).toBe(false)
		expect(press(tile, 'Enter', true)).toBe(true)
		expect(submissions).toBe(0)
		expect(press(tile, 'Enter')).toBe(true)
		expect(submissions).toBe(1)
	} finally {
		await GlobalRegistrator.unregister()
	}
})
