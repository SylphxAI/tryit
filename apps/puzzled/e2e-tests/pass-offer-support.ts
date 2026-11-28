import { readdir, readFile } from 'node:fs/promises'

export async function passReference() {
	const dir = '.output/server/_ssr'
	for (const file of await readdir(dir)) {
		if (!file.endsWith('.mjs')) continue
		const match = (await readFile(`${dir}/${file}`, 'utf8')).match(
			/createServerReference\("([^"]+)", async function readPassOffer\(/,
		)
		if (match) return match[1]
	}
	throw new Error('Missing built readPassOffer reference')
}
