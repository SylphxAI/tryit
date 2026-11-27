import { describe, expect, test } from 'bun:test'
import { inlineSegments } from './inline-segments'

describe('inlineSegments', () => {
	test('renders bold, code and https links and keeps the rest literal', () => {
		expect(
			inlineSegments('**Meta:** store `_fbp` per [Policy](https://example.com/p); done'),
		).toEqual([
			{ kind: 'strong', text: 'Meta:' },
			{ kind: 'text', text: ' store ' },
			{ kind: 'code', text: '_fbp' },
			{ kind: 'text', text: ' per ' },
			{ kind: 'link', text: 'Policy', href: 'https://example.com/p' },
			{ kind: 'text', text: '; done' },
		])
	})

	test('leaves plain copy and non-https links untouched', () => {
		expect(inlineSegments('Plain text.')).toEqual([{ kind: 'text', text: 'Plain text.' }])
		expect(inlineSegments('[x](javascript:alert(1))')).toEqual([
			{ kind: 'text', text: '[x](javascript:alert(1))' },
		])
	})
})
