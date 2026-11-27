import { afterEach, beforeEach, expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { solidStart } from '@solidjs/start/config'
import { build } from 'vite'

type Fixture = typeof import('./home-install-offer.test-fixture')
let bundled: Promise<string> | undefined
let loads = 0
// Real Solid DOM bindings (Bun does not apply Solid's JSX transform); a fresh
// module per mount, so a captured install event never leaks between cases.
async function loadFixture(): Promise<Fixture> {
	bundled ??= (async () => {
		const solid = solidStart()
			.flat()
			.find((plugin) => plugin && 'name' in plugin && plugin.name === 'solid')
		const entry = fileURLToPath(new URL('./home-install-offer.test-fixture.ts', import.meta.url))
		const result = await build({
			configFile: false,
			logLevel: 'error',
			resolve: { alias: { '@': fileURLToPath(new URL('../../../', import.meta.url)) } },
			plugins: [solid],
			build: { write: false, minify: false, lib: { entry, formats: ['es'], fileName: 'offer' } },
		})
		const output = (Array.isArray(result) ? result[0] : result) as { output: { code?: string }[] }
		return output.output[0]?.code ?? ''
	})()
	const code = `${await bundled}\n// load ${++loads}`
	return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
}

const FIRST_FINISH = 'puzzled:pwa:first-finish-day'
const DISMISSED = 'puzzled:pwa:prompt-dismissed'
// Served on 2026-10-03 in Hong Kong, an hour before its reset (device clock agrees).
const resetAt = Date.now() + 3_600_000
const today = { dayKey: '2026-10-03', servedAt: resetAt - 3_600_000, resetAt }
let reportPlay: ((onScreen: boolean) => void)[] = []
let sentEvents: string[] = []

beforeEach(() => {
	GlobalRegistrator.register({ url: 'https://tryit.fun/' })
	reportPlay = []
	sentEvents = []
	globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
		sentEvents.push(init?.body ?? '')
		return new Response('{}')
	}) as typeof fetch
	globalThis.IntersectionObserver = class {
		constructor(callback: IntersectionObserverCallback) {
			reportPlay.push((isIntersecting) => {
				const target = document.querySelector('[data-day-primary-action]') as Element
				callback([{ target, isIntersecting } as IntersectionObserverEntry], this as never)
			})
		}
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof IntersectionObserver
	document.body.innerHTML = '<a data-day-primary-action href="/games/sudoku">Play</a>'
	localStorage.setItem(FIRST_FINISH, '2026-10-02')
})
afterEach(() => GlobalRegistrator.unregister())

async function mount(day = today, offerInstall = true) {
	const { mountHomeInstallOffer, captureInstallPrompt } = await loadFixture()
	captureInstallPrompt()
	if (offerInstall) {
		const prompt = { prompt: async () => {}, userChoice: Promise.resolve({ outcome: 'dismissed' }) }
		window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), prompt))
	}
	const host = document.body.appendChild(document.createElement('div'))
	const dispose = mountHomeInstallOffer(host, day)
	const offer = () => host.querySelector<HTMLElement>('[data-home-install]')
	const shown = () => !offer()?.hidden && !!offer()?.querySelector('[data-install-nudge]')
	const play = (onScreen: boolean) => {
		for (const report of reportPlay) report(onScreen)
		return shown()
	}
	return { dispose, offer, shown, play }
}
async function shownOffScreenPlay(day = today, offerInstall = true) {
	const offer = await mount(day, offerInstall)
	const shown = offer.play(false)
	offer.dispose()
	return shown
}

test('a returning player sees the offer only while Play is off screen', async () => {
	const { dispose, offer, shown, play } = await mount()
	expect(shown()).toBe(false)
	expect(play(false)).toBe(true)
	expect(offer()?.querySelector('button')?.textContent).toContain('Install')
	expect(play(true)).toBe(false)
	offer()?.querySelector('button')?.click()
	await new Promise((resolve) => setTimeout(resolve, 0))
	dispose()
	// Shown, hidden and installed on Home: no install telemetry at all.
	expect(sentEvents).toEqual([])
})

test('the result card still reports its prompt as post_first_win', async () => {
	const { mountResultNudge, captureInstallPrompt } = await loadFixture()
	captureInstallPrompt()
	const prompt = { prompt: async () => {}, userChoice: Promise.resolve({ outcome: 'dismissed' }) }
	window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), prompt))
	const dispose = mountResultNudge(document.body.appendChild(document.createElement('div')))
	dispose()
	expect(sentEvents.map((body) => JSON.parse(body))).toEqual([
		expect.objectContaining({
			event: 'pwa_install_prompted',
			platform: 'chromium',
			trigger: 'post_first_win',
			isGuest: true,
		}),
	])
})

test('a cold visitor or a standalone window shows nothing', async () => {
	localStorage.removeItem(FIRST_FINISH)
	expect(await shownOffScreenPlay()).toBe(false)
	localStorage.setItem(FIRST_FINISH, '2026-10-02')
	window.matchMedia = ((query: string) => ({
		matches: query.includes('standalone'),
		addEventListener() {},
		removeEventListener() {},
	})) as unknown as typeof window.matchMedia
	expect(await shownOffScreenPlay()).toBe(false)
})

test('the first finish day and a stale or missing day key show nothing', async () => {
	// Exactly at the Hong Kong reset the served key is stale; an hour before, current.
	expect(await shownOffScreenPlay({ ...today, servedAt: resetAt })).toBe(false)
	expect(await shownOffScreenPlay({ ...today, dayKey: '' })).toBe(false)
	localStorage.setItem(FIRST_FINISH, today.dayKey)
	expect(await shownOffScreenPlay()).toBe(false)
})

test('dismissing is permanent, including the old dated value', async () => {
	const { dispose, offer, play } = await mount()
	play(false)
	offer()?.querySelector<HTMLButtonElement>('button[aria-label]')?.click()
	expect([play(false), localStorage.getItem(DISMISSED)]).toEqual([false, '1'])
	dispose()
	for (const value of ['1', '2026-09-01T00:00:00.000Z']) {
		localStorage.setItem(DISMISSED, value)
		expect(await shownOffScreenPlay()).toBe(false)
	}
})

test('the docked consent tray holds it back', async () => {
	document.documentElement.setAttribute('data-consent-dock', '1')
	const { dispose, play } = await mount()
	expect(play(false)).toBe(false)
	document.documentElement.removeAttribute('data-consent-dock')
	await new Promise((resolve) => setTimeout(resolve, 0))
	expect(play(false)).toBe(true)
	dispose()
})

test('an unsupported browser or blocked storage shows nothing', async () => {
	expect(await shownOffScreenPlay(today, false)).toBe(false)
	Object.defineProperty(window, 'localStorage', {
		configurable: true,
		get() {
			throw new DOMException('blocked', 'SecurityError')
		},
	})
	expect(await shownOffScreenPlay()).toBe(false)
})
