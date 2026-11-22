'use client'

import { type RefObject, useRef, useState } from 'react'

import { selectCopyText } from './select-copy-text'

export { selectCopyText } from './select-copy-text'

/** A success belongs to the text actually written, never an earlier copy attempt. */
export function useClipboardCopy(text: string, target: RefObject<HTMLElement | null>) {
	const [result, setResult] = useState<{
		text: string
		status: 'pending' | 'copied' | 'failed'
	} | null>(null)
	const latestText = useRef(text)
	latestText.current = text
	const request = useRef(0)
	const status = result?.text === text ? result.status : 'idle'

	async function copy() {
		const attempt = ++request.current
		setResult({ text, status: 'pending' })
		try {
			await navigator.clipboard.writeText(text)
			if (attempt === request.current) setResult({ text, status: 'copied' })
		} catch {
			if (attempt !== request.current || latestText.current !== text) return
			setResult({ text, status: 'failed' })
			selectCopyText(target.current)
		}
	}

	return { status, copy }
}
