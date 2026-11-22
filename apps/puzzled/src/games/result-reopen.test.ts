import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const boardSlugs = readdirSync(import.meta.dir).filter(
	(name) => Bun.file(join(import.meta.dir, name, 'solid-board.tsx')).size > 0,
)

describe('every game shares the accepted-result controls', () => {
	test('all nineteen Solid boards use the shared finish surface', () => {
		expect(boardSlugs).toHaveLength(19)
		for (const slug of boardSlugs) {
			const source = readFileSync(join(import.meta.dir, slug, 'solid-board.tsx'), 'utf8')
			expect(source).toContain('<BoardFinish')
		}
	})
})
