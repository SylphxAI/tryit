export function createWordGuessKeyHandler(
	inactive: () => boolean,
	grade: (event: KeyboardEvent) => Promise<void>,
	edit: (key: string, event: KeyboardEvent) => void,
	hasFullGuess: () => boolean,
) {
	return (event: KeyboardEvent) => {
		if (
			event.defaultPrevented ||
			event.isComposing ||
			event.ctrlKey ||
			event.altKey ||
			event.metaKey
		)
			return
		const target = event.target
		if (
			target instanceof HTMLElement &&
			(target.isContentEditable || target.closest('input, textarea, select, [contenteditable]'))
		)
			return
		if (event.key === 'Enter') {
			// The active tile is an input hint, not a keyboard key. Once full, submit from it.
			const control = target instanceof HTMLElement && target.closest('button, a, summary')
			if (control && !(control.hasAttribute('data-five-input-hint') && hasFullGuess())) return
			if (inactive()) return
			event.preventDefault()
			if (!event.repeat) void grade(event)
		} else if (!inactive() && /^[a-z]$|^Backspace$/i.test(event.key)) {
			event.preventDefault()
			edit(event.key.toUpperCase(), event)
		}
	}
}
