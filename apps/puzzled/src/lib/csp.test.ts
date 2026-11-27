import { expect, test } from 'bun:test'
import { buildCsp } from './csp'

function hosts(csp: string, name: string): string[] {
	return (
		csp
			.split('; ')
			.find((part) => part.startsWith(`${name} `))
			?.split(' ')
			.slice(1) ?? []
	)
}

test('Google tag admits collection and conversion endpoints only when configured', () => {
	const csp = buildCsp('nonce', { googleTag: true })
	expect(hosts(csp, 'connect-src')).toEqual(
		expect.arrayContaining([
			'https://google-analytics.com',
			'https://*.google-analytics.com',
			'https://analytics.google.com',
			'https://*.analytics.google.com',
			'https://www.googleadservices.com',
			'https://*.g.doubleclick.net',
			'https://ad.doubleclick.net',
		]),
	)
	expect(hosts(csp, 'frame-src')).toEqual([
		"'self'",
		'https://www.googletagmanager.com',
		'https://td.doubleclick.net',
	])
	const noTag = buildCsp('nonce')
	expect(hosts(noTag, 'connect-src')).toEqual(["'self'"])
	expect(hosts(noTag, 'frame-src')).toEqual(["'self'"])
	expect(hosts(csp, 'script-src')).toEqual(hosts(noTag, 'script-src'))
})

test('Meta Pixel hosts appear only while META_PIXEL_ID is configured', () => {
	expect(buildCsp('nonce')).not.toContain('facebook')
	expect(hosts(buildCsp('nonce', { metaPixel: true }), 'connect-src')).toEqual([
		"'self'",
		'https://connect.facebook.net',
		'https://www.facebook.com',
	])
})
