/**
 * Message-catalogue wiring guard (TD-01).
 *
 * The catalogue is one canonical file set per locale plus overlays: a locale with a
 * declared fallback (`en-GB` over `en-US`, `zh-TW` over `zh-HK`, from `./config`)
 * ships only the keys its fallback does not carry. Four invariants keep that
 * model honest:
 *
 *   1. Each locale catalogue imports exactly the files that exist on disk, in both
 *      directions - a deleted file may not stay imported and a new file may not
 *      be silently ignored;
 *   2. every overlay file still carries only its deltas - the same collapse the
 *      maintenance tool would apply must be a no-op;
 *   3. every locale resolves to the same leaf structure as en-US, namespace by
 *      namespace - a key added in one locale only fails here;
 *   4. every import is wired into its locale module’s `messages` map at the locale and namespace
 *      its own path names - an import the map no longer references, or
 *      references under another key, ships the wrong catalogue while every
 *      other invariant still passes (TD-16).
 *
 * `scripts/i18n-resolved-catalogue.ts` resolves directly from disk, independently
 * of the runtime imports, so it can also prove that both read the same values.
 */
import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { planLocale } from '../../../scripts/i18n-collapse-overlays'
import {
	MESSAGES_ROOT,
	readRawCatalogue,
	resolveLocale,
	structurePaths,
} from '../../../scripts/i18n-resolved-catalogue'
import { catalogues } from './catalogues'
import { locales } from './config'
import { loadMessages } from './messages'

/** Every namespace JSON import, grouped by the module that imports it. */
function messageImports(): Array<{ locale: string; specifier: string }> {
	return locales.flatMap((locale) =>
		[locale, `${locale}-extended`].flatMap((module) => {
			const source = readFileSync(join(import.meta.dir, 'catalogues', `${module}.ts`), 'utf8')
			return [...source.matchAll(/^import \w+ from '@\/messages\/([^']+)'$/gm)].map((match) => ({
				locale,
				specifier: match[1] as string,
			}))
		}),
	)
}

/** Every catalogue file on disk, as `<locale>/<file>.json`. */
function filesOnDisk(): string[] {
	const files: string[] = []
	for (const locale of locales) {
		for (const name of readdirSync(join(MESSAGES_ROOT, locale))) {
			if (name.endsWith('.json')) files.push(`${locale}/${name}`)
		}
	}
	return files.sort()
}

describe('message catalogue wiring', () => {
	test('runtime messages match the independently resolved catalogue in every locale', () => {
		for (const locale of locales) expect(loadMessages(locale)).toEqual(resolveLocale(locale))
	})

	test('locale modules import exactly the namespace files that exist on disk', () => {
		const imported = messageImports()
			.map(({ specifier }) => specifier)
			.sort()
		expect(imported).toEqual(filesOnDisk())
		const missing = imported.filter((specifier) => !existsSync(join(MESSAGES_ROOT, specifier)))
		expect(missing).toEqual([])
	})

	test('overlay locales carry only the keys their fallback does not supply', () => {
		for (const locale of locales) {
			const changed = planLocale(locale)
				.filter((entry) => entry.changed)
				.map((entry) => `${locale}/${entry.file}`)
			expect(changed).toEqual([])
		}
	})

	test('every locale resolves to the en-US leaf structure, per namespace', () => {
		const reference = resolveLocale('en-US')
		for (const locale of locales) {
			const resolved = resolveLocale(locale)
			const mismatches: string[] = []
			const namespaces = [...new Set([...Object.keys(resolved), ...Object.keys(reference)])].sort()
			for (const namespace of namespaces) {
				const expected = structurePaths(reference[namespace], '', []).sort()
				const actual =
					resolved[namespace] === undefined
						? []
						: structurePaths(resolved[namespace], '', []).sort()
				if (JSON.stringify(actual) !== JSON.stringify(expected)) mismatches.push(namespace)
			}
			expect({ locale, mismatches }).toEqual({ locale, mismatches: [] })
		}
	})

	test('namespace imports stay in the owning locale module', () => {
		for (const { locale, specifier } of messageImports()) {
			expect(specifier.split('/')[0]).toBe(locale)
		}
	})

	test('every raw namespace map contains the files directly read from disk', () => {
		for (const locale of locales)
			expect(catalogues[locale].messages).toEqual(readRawCatalogue(locale))
	})
})
