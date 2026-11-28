export function createArithmoKeypadEnter() {
	let pointerKey: Element | null = null

	return {
		rememberClick(event: MouseEvent) {
			if (event.detail === 0 || !(event.target instanceof Element)) return
			const key = event.target.closest('button')
			// Some browsers don't focus a pointer-clicked button. Don't remember it there.
			pointerKey = key === document.activeElement ? key : null
		},
		forgetFocus(event: FocusEvent) {
			if (event.target === pointerKey) pointerKey = null
		},
		usesNativeEnter(target: Element) {
			const control = target.closest('button, a, summary, [role="button"]')
			return control !== null && control !== pointerKey
		},
	}
}
