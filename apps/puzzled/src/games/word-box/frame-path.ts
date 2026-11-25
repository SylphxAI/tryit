import type { LetterBox } from './types'

type Point = readonly [x: number, y: number]

// Both horizontal rows read left-to-right; both columns read top-to-bottom.
const positions = {
	top: [
		[17, 0],
		[50, 0],
		[83, 0],
	],
	right: [
		[100, 17],
		[100, 50],
		[100, 83],
	],
	bottom: [
		[17, 100],
		[50, 100],
		[83, 100],
	],
	left: [
		[0, 17],
		[0, 50],
		[0, 83],
	],
} as const satisfies Record<keyof LetterBox, readonly [Point, Point, Point]>

export function framePoints(box: LetterBox): ReadonlyMap<string, Point> {
	const points = new Map<string, Point>()
	for (const side of Object.keys(positions) as (keyof LetterBox)[]) {
		box[side].forEach((letter, index) => {
			const point = positions[side][index]
			if (point) points.set(letter, point)
		})
	}
	return points
}

export function framePolyline(
	word: string,
	points: ReadonlyMap<string, Point>,
): string | undefined {
	if (word.length < 2) return undefined
	const vertices = []
	for (const letter of word) {
		const point = points.get(letter)
		if (!point) return undefined
		vertices.push(point.join(','))
	}
	return vertices.join(' ')
}
