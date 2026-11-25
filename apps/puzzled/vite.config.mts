import { fileURLToPath } from 'node:url'
import { solidStart } from '@solidjs/start/config'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

export default defineConfig({
	resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
	build: { target: 'es2022' },
	environments: {
		client: {
			build: {
				rolldownOptions: {
					output: {
						// Coalesce icons that are always imported by the same entries.
						// Leave locale, route and board imports independently lazy.
						codeSplitting: {
							groups: [{ name: 'icons', test: '/lucide-solid/', entriesAware: true }],
						},
					},
				},
			},
		},
	},
	plugins: [
		tailwindcss(),
		solidStart({ middleware: './src/middleware.ts' }),
		nitro({ preset: 'node-server', compressPublicAssets: { brotli: true, gzip: true } }),
	],
})
