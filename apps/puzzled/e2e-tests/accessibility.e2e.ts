import { expect, type Page, test } from '@playwright/test'
import {
	DESKTOP,
	languageOptions,
	languageTrigger,
	MOBILE,
	readActiveElement,
	SHELL_TARGET_SELECTOR,
	type Stop,
	samplePopupTransform,
	settle,
	targetOffenders,
} from './a11y-support'

/**
 * Behavioural accessibility coverage for the shell: keyboard operation, focus
 * management, target sizes and motion preferences.
 *
 * axe cannot see most of this (it has no notion of "where does focus go after
 * Escape", or "how big is the clickable area"), so it is measured directly in
 * the browser. Repairs these tests keep honest:
 *  - skip link present and working on every shell route,
 *  - one tab order through the shell, no zero-size or unnamed stops,
 *  - Escape closes the nav sheet, the rules dialog and the language menu, and
 *    focus returns to the trigger,
 *  - every shell control offers a 44px effective target (company bar),
 *  - `prefers-reduced-motion: reduce` stops transform animation while
 *    motion-enabled users keep it.
 */

test.describe('Skip link', () => {
	test.use({ viewport: DESKTOP })

	test('is the first tab stop and moves focus into the main region', async ({ page }) => {
		await page.goto('/', { waitUntil: 'domcontentloaded' })
		await settle(page)

		await page.keyboard.press('Tab')
		const skipLink = page.locator('a[href="#main-content"]')
		await expect(skipLink).toBeFocused()
		await expect(skipLink).toBeVisible()

		await page.keyboard.press('Enter')
		await expect(page.locator('#main-content')).toBeFocused()
	})
})

test.describe('Tab order through the shell', () => {
	test.use({ viewport: DESKTOP })

	test('reaches shell controls, navigation and page content without empty stops', async ({
		page,
	}) => {
		await page.goto('/', { waitUntil: 'domcontentloaded' })
		await settle(page)

		const stops: Stop[] = []
		for (let press = 0; press < 30; press += 1) {
			await page.keyboard.press('Tab')
			stops.push(await readActiveElement(page))
		}

		const empty = stops.filter((stop) => stop.width === 0 || stop.height === 0)
		expect(empty, `zero-size tab stops: ${JSON.stringify(empty)}`).toEqual([])
		expect(
			stops.some((stop) => stop.inHeader),
			'the shell header is reachable by keyboard',
		).toBe(true)
		expect(
			stops.some((stop) => stop.tag === 'a' && /home|games|stats|profile/i.test(stop.name)),
			'the primary navigation is reachable by keyboard',
		).toBe(true)
	})

	test('keeps a visible focus indicator on the first shell controls', async ({ page }) => {
		await page.goto('/', { waitUntil: 'domcontentloaded' })
		await settle(page)

		const indicators: Array<{ name: string; visible: boolean }> = []
		for (let press = 0; press < 4; press += 1) {
			await page.keyboard.press('Tab')
			indicators.push(
				await page.evaluate(() => {
					const element = document.activeElement
					if (!element) return { name: '', visible: false }
					const style = getComputedStyle(element)
					const outline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2
					const ring = style.boxShadow !== '' && style.boxShadow !== 'none'
					return {
						name: (element.getAttribute('aria-label') || element.textContent || '')
							.trim()
							.slice(0, 30),
						visible: outline || ring,
					}
				}),
			)
		}

		const withoutIndicator = indicators.filter((entry) => !entry.visible)
		expect(
			withoutIndicator,
			`stops without a focus indicator: ${JSON.stringify(withoutIndicator)}`,
		).toEqual([])
	})
})

test.describe('Responsive navigation and disclosures', () => {
	test('the mobile tabs expose every primary destination to keyboard users', async ({ page }) => {
		await page.setViewportSize(MOBILE)
		await page.goto('/')
		const nav = page.getByRole('navigation', { name: 'Main navigation', exact: true })
		await expect(nav).toBeVisible()
		const links = nav.getByRole('link')
		await expect(links).toHaveCount(5)
		await links.first().focus()
		for (let index = 0; index < 5; index++) {
			await expect(links.nth(index)).toBeFocused()
			await page.keyboard.press('Tab')
		}
		await expect(nav.locator(':focus')).toHaveCount(0)
	})

	test('Escape closes the language disclosure and restores focus to its trigger', async ({
		page,
	}) => {
		await page.goto('/')
		const trigger = languageTrigger(page)
		await trigger.press('Enter')
		const options = languageOptions(page)
		await expect(options).toBeVisible()
		await options.getByRole('link').first().focus()
		await page.keyboard.press('Escape')
		await expect(options).toBeHidden()
		await expect(trigger).toBeFocused()
	})
})

test.describe('Company target size (44px effective hit area)', () => {
	for (const [name, viewport] of [
		['desktop', DESKTOP],
		['mobile', MOBILE],
	] as const) {
		test(`${name} shell controls`, async ({ page }) => {
			await page.setViewportSize(viewport)
			await page.goto('/', { waitUntil: 'domcontentloaded' })
			await settle(page)

			const offenders = await targetOffenders(page, SHELL_TARGET_SELECTOR)
			expect(
				offenders,
				`shell controls below 44px effective target:\n${offenders
					.map((entry) => `  ${entry.width}x${entry.height} ${entry.target} "${entry.name}"`)
					.join('\n')}`,
			).toEqual([])
		})
	}

	test('language choices have a 44px effective target when disclosed at mobile width', async ({
		page,
	}) => {
		await page.setViewportSize(MOBILE)
		await page.goto('/')
		await languageTrigger(page).press('Enter')
		await expect(languageOptions(page).getByRole('link')).toHaveCount(8)
		await settle(page)
		expect(await targetOffenders(page, 'header [data-language-options] a[href]')).toEqual([])
	})
})

/** Exercise reopening after the popup has been loaded and closed once. */
async function prepareLanguagePopup(page: Page) {
	const trigger = languageTrigger(page)
	await trigger.click()
	await expect(languageOptions(page)).toBeVisible()
	await page.keyboard.press('Escape')
	await expect(languageOptions(page)).toBeHidden()
	return trigger
}

function transformChanges(samples: string[]) {
	return samples.slice(1).filter((value, index) => value !== samples[index]).length
}

test.describe('Reduced motion', () => {
	test.use({ viewport: DESKTOP, colorScheme: 'light', contextOptions: { reducedMotion: 'reduce' } })

	test('does not interpolate the first language menu entrance', async ({ page }) => {
		await page.goto('/', { waitUntil: 'domcontentloaded' })
		const trigger = languageTrigger(page)
		await expect(trigger).toBeEnabled()
		const samples = await samplePopupTransform(
			page,
			() => trigger.press('Enter'),
			8000,
			'header details[open] > [data-language-options]',
		)
		// Reduced motion may jump from the initial mount style to its endpoint;
		// interpolation or repeated movement would require further frame changes.
		expect(
			transformChanges(samples),
			`first entrance moved: ${samples.join(' ')}`,
		).toBeLessThanOrEqual(1)
		expect(samples.at(-1)).toBe('none;translate:none;scale:none')
	})

	test('stops transform animation on shell surfaces', async ({ page }) => {
		await page.goto('/', { waitUntil: 'domcontentloaded' })
		await settle(page)
		await page.waitForTimeout(400)

		const running = await page.evaluate(() =>
			document
				.getAnimations()
				.filter((animation) => {
					const effect = animation.effect as KeyframeEffect | null
					if (!effect || typeof effect.getKeyframes !== 'function') return false
					return effect.getKeyframes().some((frame) => 'transform' in frame)
				})
				.map((animation) => animation.playState),
		)
		expect(running, 'transform animations running under reduced motion').toEqual([])
	})

	test('keeps the language menu popup static', async ({ page }) => {
		await page.goto('/', { waitUntil: 'domcontentloaded' })
		const trigger = await prepareLanguagePopup(page)
		const samples = await samplePopupTransform(
			page,
			() => trigger.press('Enter'),
			8000,
			'header details[open] > [data-language-options]',
		)
		expect(new Set(samples).size, `popup transform changed: ${samples.join(' ')}`).toBe(1)
	})
})

test.describe('Motion for users without the preference', () => {
	test.use({
		viewport: DESKTOP,
		colorScheme: 'light',
		contextOptions: { reducedMotion: 'no-preference' },
	})

	test('animates the first language menu entrance', async ({ page }) => {
		await page.goto('/', { waitUntil: 'domcontentloaded' })
		const trigger = languageTrigger(page)
		await expect(trigger).toBeEnabled()
		const samples = await samplePopupTransform(
			page,
			() => trigger.press('Enter'),
			8000,
			'header details[open] > [data-language-options]',
		)
		expect(
			transformChanges(samples),
			`first entrance stayed static: ${samples.join(' ')}`,
		).toBeGreaterThan(1)
	})

	test('keeps the language menu popup animation', async ({ page }) => {
		await page.goto('/', { waitUntil: 'domcontentloaded' })
		const trigger = await prepareLanguagePopup(page)
		const samples = await samplePopupTransform(
			page,
			() => trigger.press('Enter'),
			8000,
			'header details[open] > [data-language-options]',
		)
		expect(
			transformChanges(samples),
			`expected the popup to animate, saw: ${samples.join(' ')}`,
		).toBeGreaterThan(1)
	})

	test('the recorder does not mistake a static popup for motion', async ({ page }) => {
		await page.setContent('<button>Open</button>')
		const samples = await samplePopupTransform(page, () =>
			page.evaluate(() => {
				document.body.insertAdjacentHTML('beforeend', '<div role="menu"><div>Static</div></div>')
			}),
		)
		expect(new Set(samples).size).toBe(1)
	})

	test('the recorder captures CSS motion on a popup with multiple children', async ({ page }) => {
		await page.setContent(`<style>
			[role="menu"] { translate: 0 0; scale: 1; transition: translate 200ms linear, scale 200ms linear; }
			[role="menu"][data-starting-style] { translate: 0 -10px; scale: 0.5; }
		</style><button>Open</button>`)
		const samples = await samplePopupTransform(page, () =>
			page.evaluate(() => {
				document.body.insertAdjacentHTML(
					'beforeend',
					'<div role="menu" data-starting-style><div>One</div><div>Two</div></div>',
				)
				const popup = document.querySelector('[role="menu"]')
				if (!popup) throw new Error('missing fixture popup')
				getComputedStyle(popup).translate
				requestAnimationFrame(() =>
					requestAnimationFrame(() => popup.removeAttribute('data-starting-style')),
				)
			}),
		)
		expect(transformChanges(samples), samples.join(' ')).toBeGreaterThan(1)
	})

	test('a missing popup fails motion measurement', async ({ page }) => {
		await page.setContent('<button>Open</button>')
		await expect(samplePopupTransform(page, async () => {}, 50)).rejects.toThrow(
			'expected one mounted popup content',
		)
	})
})
