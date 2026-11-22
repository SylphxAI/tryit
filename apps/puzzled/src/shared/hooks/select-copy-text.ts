export function selectCopyText(element: HTMLElement | null) {
	if (!element) return
	element.focus()
	if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
		element.select()
		return
	}
	const range = document.createRange()
	range.selectNodeContents(element)
	const selection = window.getSelection()
	selection?.removeAllRanges()
	selection?.addRange(range)
}
