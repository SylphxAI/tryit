import { expect, test } from 'bun:test'

const read = (relative: string) => Bun.file(new URL(relative, import.meta.url)).text()

test('the site language chooser does not load a floating menu runtime', async () => {
	const menu = await read('../../solid/language-menu.tsx')
	expect(menu).toContain('<details')
	expect(menu).toContain('<summary')
	expect(menu).not.toMatch(/DropdownMenu|floating-ui|@base-ui/)
})

test('consent is eagerly rendered after the footer and outside the fixed nav', async () => {
	const shell = await read('../../solid/site-shell.tsx')
	expect(shell).toContain("from './consent-banner'")
	expect(shell).toMatch(/<\/footer>\s*<ConsentBanner/)
})
