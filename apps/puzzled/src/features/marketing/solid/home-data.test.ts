import { expect, mock, test } from 'bun:test'

const requestUser = mock(async () => null)
mock.module('@/lib/identity/request-identity', () => ({ requestUser }))

const { readHomeFacts } = await import('./home-data')

test('anonymous home and the Knative home probe never call requestUser', async () => {
	const originalFetch = globalThis.fetch
	const originalBase = process.env.API_INTERNAL_URL
	process.env.API_INTERNAL_URL = 'http://api.test'
	globalThis.fetch = (async () => Response.json({})) as unknown as typeof fetch
	try {
		for (const headers of [new Headers(), new Headers({ 'user-agent': 'kube-probe/1.0' })]) {
			const request = new Request('https://tryit.fun/', { headers })
			expect((await readHomeFacts(request, '2026-11-25')).member).toBe(false)
		}
		expect(requestUser).not.toHaveBeenCalled()
	} finally {
		globalThis.fetch = originalFetch
		if (originalBase === undefined) delete process.env.API_INTERNAL_URL
		else process.env.API_INTERNAL_URL = originalBase
	}
})
