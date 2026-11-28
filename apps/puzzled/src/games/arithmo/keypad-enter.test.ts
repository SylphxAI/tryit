import { expect, test } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { createArithmoKeypadEnter } from './keypad-enter'

test('Arithmo preserves pointer-then-Enter and native keys after keyboard focus', async () => {
	GlobalRegistrator.register()
	try {
		const keypad = document.createElement('div')
		const digit = document.createElement('button')
		const enter = document.createElement('button')
		const link = document.createElement('a')
		keypad.append(digit, enter)
		document.body.append(keypad, link)
		const tracker = createArithmoKeypadEnter()
		keypad.addEventListener('click', tracker.rememberClick)
		keypad.addEventListener('focusout', tracker.forgetFocus)
		const activate = (detail: number) =>
			digit.dispatchEvent(new MouseEvent('click', { bubbles: true, detail }))

		digit.focus()
		expect(tracker.usesNativeEnter(digit)).toBe(true)
		activate(0) // Native keyboard activation must not change the meaning of a second Enter.
		expect(tracker.usesNativeEnter(digit)).toBe(true)
		activate(1)
		expect(tracker.usesNativeEnter(digit)).toBe(false)
		enter.focus()
		expect(tracker.usesNativeEnter(enter)).toBe(true)
		activate(1) // A non-focusing pointer click, as in Safari.
		expect(tracker.usesNativeEnter(enter)).toBe(true)
		digit.focus()
		expect(tracker.usesNativeEnter(digit)).toBe(true)
		expect(tracker.usesNativeEnter(link)).toBe(true)
		expect(tracker.usesNativeEnter(document.body)).toBe(false)
	} finally {
		await GlobalRegistrator.unregister()
	}
})
