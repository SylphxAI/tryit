/**
 * Element resets stay below the utilities.
 *
 * Regression this exists for: globals.css carried an unlayered
 * `button { border: none }`. Tailwind v4 puts utilities in `@layer utilities`,
 * and unlayered CSS beats every layer, so each `border` class on a <button>
 * computed to 0px. The cookie banner's Decline, Settings and Accept then read
 * as captions instead of buttons, and the Google sign-in button lost its
 * outline.
 *
 * The guard: a top-level (unlayered) rule that targets a bare form or link
 * element may not set a box property a utility class would set. Put such a
 * reset in `@layer base`. Focus rings (outline, box-shadow) are left out:
 * they override utilities on purpose (WCAG 2.4.7).
 */
import { describe, expect, test } from 'bun:test'
import { transform } from 'lightningcss'
import { buildGlobalCss } from './test-support/build-global-css'

const ELEMENTS = new Set(['button', 'input', 'select', 'textarea', 'a', 'label'])
const BOX_PROPERTY = /^(border|background|padding|margin|width|height|min-|max-|display|color$)/

function unlayeredResets(css: string): string[] {
	const offenders: string[] = []
	transform({
		filename: 'globals.css',
		code: Buffer.from(css),
		visitor: {
			StyleSheet({ rules }) {
				for (const rule of rules) {
					if (rule.type !== 'style') continue
					const { selectors, declarations } = rule.value
					if (
						!selectors.some((selector) =>
							selector.some((part) => part.type === 'type' && ELEMENTS.has(part.name)),
						)
					)
						continue
					for (const decl of [
						...(declarations?.declarations ?? []),
						...(declarations?.importantDeclarations ?? []),
					]) {
						const property =
							decl.property === 'unparsed' ? decl.value.propertyId.property : decl.property
						if (BOX_PROPERTY.test(property)) offenders.push(property)
					}
				}
			},
		},
	})
	return offenders
}

describe('globals.css element resets', () => {
	test('no unlayered element rule overrides a utility-owned property', async () => {
		expect(unlayeredResets(await buildGlobalCss())).toEqual([])
	}, 15_000)

	test('detects the original defect while allowing a layered reset and focus styling', () => {
		expect(unlayeredResets('button { border: none; cursor: pointer }')).toEqual(['border'])
		expect(
			unlayeredResets(
				'@layer base { button { border: none } } button:focus { outline: 1px solid }',
			),
		).toEqual([])
	})
})
