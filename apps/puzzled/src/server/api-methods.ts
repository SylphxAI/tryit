/** Preserve the API's automatic OPTIONS and unsupported-method responses. */
export function apiMethodResponses(methods: ('GET' | 'POST')[]) {
	const allowed = [...methods, 'OPTIONS', ...(methods.includes('GET') ? ['HEAD'] : [])]
	return {
		options: () =>
			new Response(null, { status: 204, headers: { Allow: allowed.sort().join(', ') } }),
		notAllowed: () => new Response(null, { status: 405 }),
	}
}
