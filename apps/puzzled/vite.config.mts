import { fileURLToPath } from 'node:url'
import { solidStart } from '@solidjs/start/config'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

export default defineConfig({
	resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
	build: { target: 'es2022' },
	plugins: [
		{
			name: 'puzzled:browser-message-catalogue',
			enforce: 'pre',
			resolveId(source, importer) {
				// Keep the complete server registry out of the browser graph even
				// when the bundler cannot prove a module initializer has no effects.
				if (this.environment.config.consumer !== 'client' || source !== './messages') return
				if (!importer?.endsWith('/src/lib/i18n/translate.ts')) return
				return fileURLToPath(new URL('./src/lib/i18n/browser-catalogue.ts', import.meta.url))
			},
		},
		tailwindcss(),
		solidStart({ middleware: './src/middleware.ts' }),
		nitro({ preset: 'node-server', compressPublicAssets: { brotli: true, gzip: true } }),
	],
})
