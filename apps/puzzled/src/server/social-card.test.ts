import { expect, test } from 'bun:test'
import { serveSocialCard } from './social-card'

const PNG_MAGIC = [137, 80, 78, 71, 13, 10, 26, 10]

test('renders a full-size, themed PNG and keeps social caching and index policy', async () => {
	const response = await serveSocialCard(
		new Request('https://tryit.fun/og?title=Sudoku&theme=cyan'),
	)
	expect(response.status).toBe(200)
	expect(response.headers.get('content-type')).toBe('image/png')
	expect(response.headers.get('x-robots-tag')).toBe('noindex')
	expect(response.headers.get('cache-control')).toContain('s-maxage=86400')
	const bytes = await response.arrayBuffer()
	expect(Array.from(new Uint8Array(bytes, 0, 8))).toEqual(PNG_MAGIC)
	const view = new DataView(bytes)
	expect(view.getUint32(16)).toBe(1200)
	expect(view.getUint32(20)).toBe(630)
})

test('only serves localized cards for a supported locale', async () => {
	const response = await serveSocialCard(new Request('https://tryit.fun/fr/og'), 'fr')
	expect(response.status).toBe(404)
})
