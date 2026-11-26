export function createWordGuessKeyHandler(
	inactive: () => boolean,
	grade: () => Promise<void>,
	edit: (key: string) => void,
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
			// Keep focused buttons and links natively activatable.
			if (target instanceof HTMLElement && target.closest('button, a, summary')) return
			if (inactive()) return
			event.preventDefault()
			if (!event.repeat) void grade()
		} else if (!inactive() && /^[a-z]$|^Backspace$/i.test(event.key)) {
			event.preventDefault()
			edit(event.key.toUpperCase())
		}
	}
}
