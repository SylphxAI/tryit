import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { solidStart } from '@solidjs/start/config'
import { build } from 'vite'

// Run the real DOM bindings: Bun does not compile JSX with Solid's transform.
async function loadRankRail() {
	const solid = solidStart()
		.flat()
		.find((plugin) => plugin && 'name' in plugin && plugin.name === 'solid')
	if (!solid) throw new Error('Missing Solid JSX compiler')

	const result = await build({
		configFile: false,
		logLevel: 'error',
		resolve: { alias: { '@': fileURLToPath(new URL('../../', import.meta.url)) } },
		plugins: [solid],
		build: {
			write: false,
			minify: false,
			lib: {
				entry: fileURLToPath(new URL('./rank-rail.test-fixture.ts', import.meta.url)),
				formats: ['es'],
				fileName: 'rank-rail-test',
			},
		},
	})
	const bundle = Array.isArray(result) ? result[0] : result
	const entry =
		'output' in bundle
			? bundle.output.find((asset) => asset.type === 'chunk' && asset.isEntry)
			: undefined
	if (entry?.type !== 'chunk') throw new Error('Missing RankRail test entry')
	return import(
		`data:text/javascript;base64,${Buffer.from(entry.code).toString('base64')}`
	) as Promise<typeof import('./rank-rail.test-fixture')>
}

test('RankRail updates the next-rank label as score changes and clears it at max score', async () => {
	GlobalRegistrator.register()
	try {
		const { mountRankRail } = await loadRankRail()
		const host = document.createElement('div')
		const { setScore, dispose } = mountRankRail(host)
		try {
			const subtitle = host.querySelector('p')
			expect(subtitle?.textContent).toBe('+6 to Warm Up')

			setScore(5)
			expect(subtitle?.textContent).toBe('+1 to Warm Up')

			setScore(14)
			expect(host.querySelector('[role="progressbar"]')?.getAttribute('aria-valuetext')).toBe(
				'Score: 14 · Warm Up',
			)
			expect(subtitle?.textContent).toBe('+1 to Steady')

			setScore(292)
			expect(host.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('100')
			expect(subtitle?.textContent).toBe('')
		} finally {
			dispose()
		}
	} finally {
		await GlobalRegistrator.unregister()
	}
}, 15_000)
