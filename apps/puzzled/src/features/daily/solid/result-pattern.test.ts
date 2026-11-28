import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { solidStart } from '@solidjs/start/config'
import { build } from 'vite'

// Bun does not compile JSX with Solid's transform, so build the fixture with it.
async function loadFixture() {
	const solid = solidStart()
		.flat()
		.find((plugin) => plugin && 'name' in plugin && plugin.name === 'solid')
	if (!solid) throw new Error('Missing Solid JSX compiler')
	const result = await build({
		configFile: false,
		logLevel: 'error',
		resolve: { alias: { '@': fileURLToPath(new URL('../../../', import.meta.url)) } },
		plugins: [solid],
		build: {
			write: false,
			minify: false,
			lib: {
				entry: fileURLToPath(new URL('./result-pattern.test-fixture.ts', import.meta.url)),
				formats: ['es'],
				fileName: 'result-pattern-test',
			},
		},
	})
	const bundle = Array.isArray(result) ? result[0] : result
	const entry =
		'output' in bundle
			? bundle.output.find((asset) => asset.type === 'chunk' && asset.isEntry)
			: undefined
	if (entry?.type !== 'chunk') throw new Error('Missing ResultPattern test entry')
	return import(
		`data:text/javascript;base64,${Buffer.from(entry.code).toString('base64')}`
	) as Promise<typeof import('./result-pattern.test-fixture')>
}

test('the Hive preview names words and pangrams, never hit, near or miss', async () => {
	const { mountResultPattern } = await loadFixture()
	GlobalRegistrator.register()
	try {
		const host = document.createElement('div')
		const dispose = mountResultPattern(host, 'word-hive', '🟩🟩🟨🟩🟩🟩🟩🟩🟩🟨\n🟩')
		const preview = host.querySelector('[role="img"]')
		expect(preview?.getAttribute('aria-label')).toBe('Words found: 11, pangrams: 2')
		const tiles = [...host.querySelectorAll<HTMLElement>('[data-tile]')].map(
			(tile) => tile.dataset.tile,
		)
		expect(tiles.filter((tile) => tile === 'near')).toHaveLength(2)
		expect(tiles).not.toContain('miss')
		dispose()
		mountResultPattern(host, 'quad-words', '🟩🟨⬛')
		expect(host.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe(
			'Pattern: 1 hit / 1 near / 1 miss',
		)
	} finally {
		await GlobalRegistrator.unregister()
	}
})
