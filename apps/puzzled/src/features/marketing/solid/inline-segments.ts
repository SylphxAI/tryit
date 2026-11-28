/**
 * The inline marks legal copy may use: **bold**, `code` and [label](https://…).
 * Anything else, including a link to a non-https URL, stays literal text.
 */
export type InlineSegment =
	| { kind: 'text'; text: string }
	| { kind: 'strong'; text: string }
	| { kind: 'code'; text: string }
	| { kind: 'link'; text: string; href: string }

const MARK = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g

export function inlineSegments(source: string): InlineSegment[] {
	const out: InlineSegment[] = []
	let last = 0
	for (const match of source.matchAll(MARK)) {
		const at = match.index ?? 0
		if (at > last) out.push({ kind: 'text', text: source.slice(last, at) })
		const [, strong, code, label, href] = match
		if (strong !== undefined) out.push({ kind: 'strong', text: strong })
		else if (code !== undefined) out.push({ kind: 'code', text: code })
		else out.push({ kind: 'link', text: label ?? '', href: href ?? '' })
		last = at + match[0].length
	}
	if (last < source.length) out.push({ kind: 'text', text: source.slice(last) })
	return out
}
