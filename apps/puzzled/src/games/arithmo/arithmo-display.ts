import type { CharStatus } from './types'

export const tones: Record<CharStatus, string> = {
	empty: 'border-border bg-background',
	correct: 'border-correct bg-correct text-[#1a1712]',
	present: 'border-present bg-present text-[#1a1712]',
	absent: 'border-border bg-muted text-foreground',
}
export const glyph = (char: string) => ({ '*': '×', '/': '÷', '-': '−' })[char] ?? char
