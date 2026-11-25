import { expect, test } from 'bun:test'
import { GAME_ICON_ART } from './game-icon-art'

for (const file of ['pattern-match.svg', 'pattern-match-zoom.svg']) {
	test(`${file} uses only circle, triangle and hexagon glyphs`, async () => {
		const svg = await Bun.file(new URL(`../../../../public/motifs/${file}`, import.meta.url)).text()
		const polygons = Array.from(
			svg.matchAll(/<polygon\b[^>]*\bpoints="([^"]+)"/g),
			([, points]) => points.trim().split(/[\s,]+/).length / 2,
		)
		expect(polygons.sort((a, b) => a - b)).toEqual([3, 6])
		expect(svg).toMatch(/<circle\b/)
		expect(svg).not.toMatch(/<(?:ellipse|path)\b/)
		for (const glyph of ['circle', 'triangle', 'hexagon']) {
			expect(svg).toContain(`<use href="#${glyph}"`)
		}
	})
}

test('Match icon uses a circle and polygons with three and six vertices', () => {
	const art = GAME_ICON_ART['pattern-match']
	expect(art.map((shape) => shape.kind)).toEqual(['circle', 'path', 'path'])
	const paths = art.flatMap((shape) => (shape.kind === 'path' ? [shape.d] : []))
	for (const path of paths) {
		expect(path).toMatch(/^M(?:-?[\d.]+ -?[\d.]+ ?)+Z$/)
	}
	expect(paths.map((path) => path.slice(1, -1).split(' ').length / 2)).toEqual([3, 6])
})
