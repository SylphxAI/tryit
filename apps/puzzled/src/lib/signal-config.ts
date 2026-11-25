import { env } from './env'

export function signalStreamConfig(
	source: Pick<typeof env, 'SYLPHX_PUBLISHABLE_KEY' | 'SYLPHX_API_URL'> = env,
) {
	const apiKey = source.SYLPHX_PUBLISHABLE_KEY?.trim()
	if (!apiKey?.startsWith('sylphx_pk_')) return undefined
	try {
		const url = new URL(source.SYLPHX_API_URL?.trim() || 'https://api.sylphx.com')
		if (url.protocol === 'https:' && url.href === `${url.origin}/`) {
			return { apiKey, baseUrl: url.origin }
		}
	} catch {
		// Disable Signal if its API origin is invalid.
	}
}
