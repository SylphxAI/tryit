import { beforeAll, describe, expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'
import { solidStart } from '@solidjs/start/config'
import { build } from 'vite'
import { frozenPuzzle } from '@/games/test-fixtures'
import type { renderBoard } from './board-ssr.fixture'

let render: typeof renderBoard

beforeAll(async () => {
	// Bun's JSX transform is not Solid's SSR compiler. Use the SolidStart
	// JSX transform on a small SSR bundle without starting a server.
	const plugins = solidStart({ devOverlay: false })
		.flat()
		.filter((p) => p && 'name' in p && p.name === 'solid')
	if (plugins.length !== 1) throw new Error('Solid SSR transform not found')
	const result = await build({
		configFile: false,
		plugins: [
			...plugins,
			{
				// Icons are cosmetic here; compiling their entire JSX export barrel is unnecessary.
				name: 'ssr-test-icons',
				resolveId: (id) => (id === 'lucide-solid' ? '\0ssr-test-icons' : undefined),
				load: (id) => (id === '\0ssr-test-icons' ? 'export const Delete = () => null' : undefined),
			},
		],
		logLevel: 'error',
		resolve: { alias: { '@': fileURLToPath(new URL('../../../', import.meta.url)) } },
		ssr: { noExternal: true },
		build: {
			ssr: fileURLToPath(new URL('./board-ssr.fixture.tsx', import.meta.url)),
			write: false,
			// This fixture is evaluated as a data URL, so it cannot resolve relative chunks.
			rolldownOptions: { output: { codeSplitting: false } },
		},
	})
	if (Array.isArray(result) || !('output' in result)) throw new Error('Expected one SSR build')
	const [entry] = result.output
	if (result.output.length !== 1 || entry?.type !== 'chunk')
		throw new Error('Expected one SSR chunk')
	const { renderBoard: renderFixture } = await import(
		`data:text/javascript;base64,${Buffer.from(entry.code).toString('base64')}`
	)
	render = renderFixture
}, 20_000)

describe('playable word boards in Solid SSR', () => {
	const cases = [
		['word-guess', 'data-current'],
		['quad-words', 'data-quad-board'],
		['word-hive', 'data-hive-board'],
	] as const
	test.each(cases)('%s renders real board HTML and disposes without a DOM', (slug, marker) => {
		expect(typeof window).toBe('undefined')
		const { puzzleData } = frozenPuzzle({ slug })
		const html = render(slug, {
			locale: 'en-US',
			puzzle: { kind: 'playable', puzzleData, puzzleId: 'fixture', puzzleDate: '2026-01-01' },
			onAlreadyPlayed: () => {},
		})
		expect(html).toContain(marker)
	})
})
