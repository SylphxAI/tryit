import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { solidStart } from '@solidjs/start/config'
import { build } from 'vite'

test('keyboard focus selects the Sudoku square without Enter and follows arrow moves', async () => {
	// Compile the real Solid DOM handlers; Bun's JSX transform does not wire them.
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
				entry: fileURLToPath(new URL('./solid-board.test-fixture.ts', import.meta.url)),
				formats: ['es'],
			},
			rollupOptions: { output: { codeSplitting: false } },
		},
	})
	const bundle = Array.isArray(result) ? result[0] : result
	const entry =
		'output' in bundle
			? bundle.output.find((item) => item.type === 'chunk' && item.isEntry)
			: undefined
	if (entry?.type !== 'chunk') throw new Error('Missing Sudoku test entry')

	GlobalRegistrator.register({ url: 'https://tryit.fun/' })
	try {
		const { mountSudoku } = (await import(
			`data:text/javascript;base64,${Buffer.from(entry.code).toString('base64')}`
		)) as typeof import('./solid-board.test-fixture')
		const host = document.body.appendChild(document.createElement('div'))
		const dispose = mountSudoku(host)
		try {
			const cells = host.querySelectorAll<HTMLButtonElement>('.play-board button')
			const [given, blank, next] = cells
			const press = (key: string) =>
				document.activeElement?.dispatchEvent(
					new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
				)
			blank.focus()
			press('2')
			expect(blank.textContent).toBe('2')
			expect(blank.hasAttribute('data-selected')).toBe(true)
			expect([...cells].filter((cell) => cell.tabIndex === 0)).toEqual([blank])
			press('ArrowRight')
			expect(document.activeElement === next).toBe(true)
			press('4')
			expect(next.textContent).toBe('4')
			press('ArrowLeft')
			press('ArrowLeft')
			expect(document.activeElement === given).toBe(true)
			press('7')
			expect(given.textContent).toBe('3')
		} finally {
			dispose()
		}
	} finally {
		await GlobalRegistrator.unregister()
	}
}, 15_000)
