import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { build } from 'vite'

const root = fileURLToPath(new URL('../../../', import.meta.url))

// Compile the real stylesheet with the production Tailwind/Vite integration
// without starting a server or writing to the app's build directory.
export async function buildGlobalCss() {
	const result = await build({
		root,
		configFile: false,
		logLevel: 'silent',
		plugins: [tailwindcss()],
		build: {
			write: false,
			target: 'es2022',
			rolldownOptions: { input: join(root, 'src/app/globals.css') },
		},
	})
	if (!('output' in result)) throw new Error('Expected a single Vite build output')
	const css = result.output.find(
		(asset) => asset.type === 'asset' && asset.fileName.endsWith('.css'),
	)
	if (css?.type !== 'asset') throw new Error('Vite did not emit globals.css')
	return typeof css.source === 'string' ? css.source : new TextDecoder().decode(css.source)
}
