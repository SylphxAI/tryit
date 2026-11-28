import { expect, test } from 'bun:test'
import { createClient } from '@connectrpc/connect'
import { PuzzleService } from '@/gen/connect/puzzled/v1/puzzle_pb'
import { getDaily } from '@/lib/connect/puzzle-client'
import {
	hasGuestProgressCookie,
	hasProgressCookie,
	requestConnectTransport,
} from './request-connect'

// Fetch-level test: exercise the generated Connect consumer with two concurrent requests.
test('request transport keeps whitelisted cookie bytes and browser agents separate', async () => {
	const originalBase = process.env.API_INTERNAL_URL
	const originalFetch = globalThis.fetch
	const seen: Request[] = []
	process.env.API_INTERNAL_URL = 'http://api.test'
	globalThis.fetch = (async (input, init) => {
		seen.push(new Request(input, init))
		return Response.json({ requiresStart: true })
	}) as typeof fetch
	try {
		const a = new Headers({
			cookie: 'puzzled_session=a%2Fb==; ignored=tracking; puzzled_checkout_claim=claim',
			'user-agent': 'Browser A',
		})
		const b = new Headers({
			cookie:
				'puzzled_guest_id=legacy; __Host-puzzled_guest=guest; __sylphx_product_session=member',
			'user-agent': 'Browser B',
		})
		const probe = new Headers({ cookie: 'puzzled_guest_id=legacy', 'user-agent': 'kube-probe/1.0' })
		expect([hasProgressCookie(a), hasProgressCookie(b), hasProgressCookie(probe)]).toEqual([
			true,
			true,
			false,
		])
		await Promise.all(
			[a, b, probe].map((headers) =>
				getDaily(
					{ gameSlug: 'sudoku' },
					createClient(PuzzleService, requestConnectTransport(headers)),
				),
			),
		)
		expect(
			seen.map((request) => [
				request.url,
				request.headers.get('user-agent'),
				request.headers.get('cookie'),
			]),
		).toEqual([
			[
				'http://api.test/puzzled.v1.PuzzleService/GetDaily',
				'Browser A',
				'puzzled_session=a%2Fb==; puzzled_checkout_claim=claim',
			],
			[
				'http://api.test/puzzled.v1.PuzzleService/GetDaily',
				'Browser B',
				'__Host-puzzled_guest=guest; __sylphx_product_session=member',
			],
			['http://api.test/puzzled.v1.PuzzleService/GetDaily', null, null],
		])
	} finally {
		globalThis.fetch = originalFetch
		if (originalBase === undefined) delete process.env.API_INTERNAL_URL
		else process.env.API_INTERNAL_URL = originalBase
	}
})

test('only one nonempty guest cookie establishes a guest credential candidate', () => {
	for (const cookie of [
		'',
		'puzzled_guest_id=legacy',
		'__Host-puzzled_guest=',
		'__Host-puzzled_guest=one; __Host-puzzled_guest=two',
	]) {
		expect(hasGuestProgressCookie(new Headers({ cookie }))).toBe(false)
	}
	expect(hasGuestProgressCookie(new Headers({ cookie: '__Host-puzzled_guest=guest' }))).toBe(true)
})
