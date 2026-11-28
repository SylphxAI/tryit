#!/usr/bin/env bun

/**
 * Local ingress for the API/web split declared in sylphx.toml. It sends whole
 * API path segments (and their descendants) to Rust and everything else to
 * SolidStart, without changing cookies, request bodies or the public origin.
 *
 * Usage (defaults match docs/reference/local-stack.md):
 *   bun scripts/local-stack.ts
 *   PUZZLED_WEB_PORT=3000 PUZZLED_API_PORT=8787 PUZZLED_STACK_PORT=9999 \
 *     bun scripts/local-stack.ts
 */

import { services } from '../sylphx.toml' with { type: 'toml' }

const apiPrefixes: unknown = services.find(
	(service: { name: string }) => service.name === 'api',
)?.path_prefixes
if (
	!Array.isArray(apiPrefixes) ||
	apiPrefixes.length === 0 ||
	!apiPrefixes.every(
		(path): path is string => typeof path === 'string' && /^\/[^/\s?#][^\s?#]*$/.test(path),
	)
) {
	throw new Error('sylphx.toml must declare non-root api path_prefixes for the local stack')
}
// PathPrefix ignores trailing slashes in the declaration, not path segments.
const API_PREFIXES = apiPrefixes.map((prefix) => prefix.replace(/\/+$/, ''))

/** Response headers that describe the upstream framing, not the payload. */
const STRIP_RESPONSE_HEADERS = [
	'content-encoding',
	'content-length',
	'transfer-encoding',
	'connection',
] as const

function portFromEnv(key: string, fallback: number): number {
	const raw = process.env[key]?.trim()
	if (!raw) return fallback
	const port = Number(raw)
	if (!Number.isInteger(port) || port <= 0 || port > 65535) {
		throw new Error(`${key} must be a TCP port: ${raw}`)
	}
	return port
}

export function startLocalStack(ports: { webPort: number; apiPort: number; port: number }) {
	const web = `http://127.0.0.1:${ports.webPort}`
	const api = `http://127.0.0.1:${ports.apiPort}`
	const revision = Bun.spawnSync(['git', 'rev-parse', 'HEAD']).stdout.toString().trim()

	return Bun.serve({
		port: ports.port,
		hostname: '127.0.0.1',
		async fetch(request) {
			const url = new URL(request.url)
			const toApi = API_PREFIXES.some(
				(prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`),
			)
			const headers = new Headers(request.headers)
			headers.set('host', url.host)
			headers.set('x-forwarded-host', url.host)
			headers.set('x-forwarded-proto', 'http')

			const init: RequestInit = { method: request.method, headers, redirect: 'manual' }
			if (request.method !== 'GET' && request.method !== 'HEAD') {
				init.body = request.body
			}

			const target = `${toApi ? api : web}${url.pathname}${url.search}`
			try {
				const upstream = await fetch(target, init)
				const responseHeaders = new Headers(upstream.headers)
				for (const name of STRIP_RESPONSE_HEADERS) responseHeaders.delete(name)
				if (revision) responseHeaders.set('x-revision-sha', revision)
				console.log(
					`${request.method} ${url.pathname} -> ${toApi ? 'api' : 'web'} ${upstream.status}`,
				)
				return new Response(upstream.body, { status: upstream.status, headers: responseHeaders })
			} catch (error) {
				console.log(`${request.method} ${url.pathname} -> ${toApi ? 'api' : 'web'} unreachable`)
				return new Response(`local stack: ${toApi ? api : web} unreachable: ${error}\n`, {
					status: 502,
				})
			}
		},
	})
}

if (import.meta.main) {
	const webPort = portFromEnv('PUZZLED_WEB_PORT', 3000)
	const apiPort = portFromEnv('PUZZLED_API_PORT', 8080)
	const server = startLocalStack({
		webPort,
		apiPort,
		port: portFromEnv('PUZZLED_STACK_PORT', 9999),
	})
	console.log(
		`local stack on ${server.url.origin} (web http://127.0.0.1:${webPort}, api http://127.0.0.1:${apiPort})`,
	)
}
