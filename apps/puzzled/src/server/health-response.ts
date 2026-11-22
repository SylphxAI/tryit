/**
 * The web service's readiness check (sylphx.toml `[[services]] web.health`).
 *
 * It answers from the web process alone and calls nothing: the platform
 * probes it every few seconds, and probing `/` rendered the whole home page
 * with about 20 api reads per probe. The api has its own `/healthz`.
 */
export function GET(): Response {
	return Response.json({ status: 'ok' }, { headers: { 'cache-control': 'no-store' } })
}
