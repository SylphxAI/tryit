import { expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dir, '../../../../..')

test('package scripts do not apply migrations and root build only builds the app', () => {
	for (const file of ['package.json', 'apps/puzzled/package.json']) {
		const { scripts } = JSON.parse(readFileSync(resolve(ROOT, file), 'utf8')) as {
			scripts: Record<string, string>
		}
		for (const [name, command] of Object.entries(scripts)) {
			expect(command, `${file}:${name}`).not.toMatch(/\bmigrate\s+apply\b/)
		}
		if (file === 'package.json') {
			expect(scripts.build).toBe('turbo run build --filter=@sylphx/puzzled')
		}
	}
})

test('normal deploy executes baseline DDL on an empty preview database', () => {
	const config = Bun.TOML.parse(readFileSync(resolve(ROOT, 'sylphx.toml'), 'utf8')) as {
		database: { migrations: { engine: string; image: string; command: string } }
	}
	const migration = config.database.migrations
	expect(migration.engine).toBe('atlas')
	expect(migration.image).toBe('api')
	expect(migration.command.split(/\s+/)).toEqual([
		'atlas',
		'migrate',
		'apply',
		'--dir',
		'file:///app/apps/puzzled/atlas/migrations',
		'--url',
		'$MIGRATOR_DATABASE_URL',
		'--revisions-schema',
		'public',
	])
	// --baseline skips executing that file. --allow-dirty would hide a missing
	// ledger on an unmanaged populated database. Neither belongs in deploy.
	expect(migration.command).not.toContain('--baseline')
	expect(migration.command).not.toContain('--allow-dirty')
	const directory = resolve(ROOT, 'apps/puzzled/atlas/migrations')
	const first = readdirSync(directory)
		.filter((name) => name.endsWith('.sql'))
		.sort()[0]
	expect(first).toBe('20260222000000_baseline.sql')
	const baseline = readFileSync(resolve(directory, first ?? ''), 'utf8')
	expect(baseline).toContain('CREATE TABLE "game_sessions"')
	const next = readFileSync(resolve(directory, '20260812000000_ritual_completion_drc.sql'), 'utf8')
	expect(next).toContain('ALTER TABLE "game_sessions"')
})
