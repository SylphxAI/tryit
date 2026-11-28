import { afterEach, expect, test } from 'bun:test'
import { CONSENT_KEY } from '@/lib/storage-keys'
import { setConsentContext } from './consent'
import {
	resetPlusViewStages,
	stageEntrySurface,
	trackGameFinishStage,
	trackGameStartStage,
	trackPlusViewStage,
	trackPurchaseStage,
} from './signal-stages'

const realFetch = globalThis.fetch
const globals = globalThis as unknown as Record<string, unknown>
const stream = { apiKey: 'sylphx_pk_local_fixture', baseUrl: 'https://signal.example.test' }
type Sent = { event_id: string; event_name: string; properties: Record<string, unknown> }

function page(choice: string | null) {
	const store = new Map<string, string>()
	if (choice) store.set(CONSENT_KEY, choice)
	globals.window = {
		location: { href: 'https://tryit.fun/games/sudoku?email=private@example.com' },
		localStorage: {
			getItem: (k: string) => store.get(k) ?? null,
			setItem: store.set.bind(store),
			removeItem: store.delete.bind(store),
		},
		addEventListener: () => {},
		removeEventListener: () => {},
		dispatchEvent: () => {},
	}
	globals.document = { cookie: '' }
	const sent: Sent[] = []
	globalThis.fetch = (async (_url, init) => {
		sent.push(...JSON.parse(String(init?.body)).events)
		return new Response(null, { status: 202 })
	}) as typeof fetch
	return sent
}

async function everyStage() {
	trackGameStartStage('sudoku', 'daily')
	trackGameFinishStage('sudoku', 'daily', 'won')
	trackPlusViewStage('game_unlock')
	await trackPurchaseStage({ orderId: 'pi_fixture_paid', value: 4.99, currency: 'USD' })
}

afterEach(() => {
	setConsentContext(null)
	resetPlusViewStages()
	globalThis.fetch = realFetch
	globals.window = undefined
	globals.document = undefined
})

test('entry_surface is an allowlisted enum; unknown or free-form input becomes other', () => {
	expect(stageEntrySurface('game_unlock')).toBe('game_unlock')
	expect(stageEntrySurface('pricing_subscribe')).toBe('pricing_subscribe')
	for (const value of [
		'someone@example.com',
		'usr_01abc',
		'cpc',
		'',
		undefined,
		42,
		'x'.repeat(200),
	])
		expect(stageEntrySurface(value)).toBe('other')
})

test('a saved grant emits each stage with only allowlisted properties', async () => {
	const sent = page('analytics_only')
	setConsentContext({ region: 'EEA', gpc: false, stream })
	await everyStage()
	trackPlusViewStage('game_unlock') // Same surface on the same page load: once.
	trackPlusViewStage('free-form <script>')
	expect(sent.map((e) => [e.event_name, e.properties])).toEqual([
		['game_start', { game_slug: 'sudoku', mode: 'daily' }],
		['game_finish', { game_slug: 'sudoku', mode: 'daily', status: 'won' }],
		['plus_view', { entry_surface: 'game_unlock' }],
		['purchase', { value: 4.99, currency: 'USD' }],
		['plus_view', { entry_surface: 'other' }],
	])
	const purchase = sent[3]
	expect(purchase?.event_id).toMatch(/^purchase:[A-Za-z0-9_-]{43}$/)
	expect(JSON.stringify(sent)).not.toMatch(/pi_fixture_paid|@|private/)
})

test('the purchase event id is stable per settled order, so a reload deduplicates', async () => {
	const sent = page('granted')
	setConsentContext({ region: 'ROW', gpc: false, stream })
	await trackPurchaseStage({ orderId: 'pi_fixture_paid', value: 4.99, currency: 'USD' })
	await trackPurchaseStage({ orderId: 'pi_fixture_paid', value: 4.99, currency: 'USD' })
	await trackPurchaseStage({ orderId: 'pi_fixture_other', value: 4.99, currency: 'USD' })
	expect(sent).toHaveLength(3)
	expect(sent[0]?.event_id).toBe(sent[1]?.event_id)
	expect(sent[2]?.event_id).not.toBe(sent[0]?.event_id)
})

test('purchase needs a well-formed settled receipt; invalid or non-positive values send nothing', async () => {
	const sent = page('granted')
	setConsentContext({ region: 'ROW', gpc: false, stream })
	for (const receipt of [
		{ orderId: '', value: 4.99, currency: 'USD' },
		{ orderId: 'pi bad', value: 4.99, currency: 'USD' },
		{ orderId: 'pi_ok', value: 0, currency: 'USD' },
		{ orderId: 'pi_ok', value: Number.NaN, currency: 'USD' },
		{ orderId: 'pi_ok', value: 4.99, currency: 'usd' },
	])
		expect(await trackPurchaseStage(receipt)).toBe(false)
	expect(trackGameStartStage('not-a-game', 'daily')).toBe(false)
	expect(sent).toHaveLength(0)
})

const refusals: Array<[string, string | null, { region: 'EEA' | 'ROW'; gpc: boolean }]> = [
	['stored refusal', 'denied', { region: 'ROW', gpc: false }],
	['EEA before any choice', null, { region: 'EEA', gpc: false }],
	['ROW without a saved grant', null, { region: 'ROW', gpc: false }],
	['GPC over a stored grant', 'granted', { region: 'ROW', gpc: true }],
	['GPC in EEA over a stored grant', 'granted', { region: 'EEA', gpc: true }],
]
for (const [name, choice, context] of refusals) {
	test(`${name}: zero optional stage requests`, async () => {
		const sent = page(choice)
		setConsentContext({ ...context, stream })
		await everyStage()
		expect(sent).toHaveLength(0)
	})
}

test('without consent context (not yet resolved) nothing is sent', async () => {
	const sent = page('granted')
	await everyStage()
	expect(sent).toHaveLength(0)
})
