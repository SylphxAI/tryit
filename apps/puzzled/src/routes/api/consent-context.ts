import { resolveEffectiveConsent } from '@sylphx/sdk/signal'
import { googleTagIds } from '@/features/analytics/lib/google-tag'
import { metaPixelId } from '@/features/analytics/lib/meta-pixel'
import { env } from '@/lib/env'
import { signalStreamConfig } from '@/lib/signal-config'

// Tryit adds South Korea, European territories, and regional aliases to the SDK's opt-in set.
const STRICT_TERRITORIES = new Set(
	'AC AN AX CP DG EA EU EZ GF GG GI GP IC IM JE KR MF MQ RE SJ SU TA UK UN XK YT YU'.split(' '),
)

// Only a policy bucket leaves the server. Page HTML and cache keys stay geo-neutral.
export function GET({ request }: { request: Request }) {
	const country = request.headers.get('CF-IPCountry') ?? ''
	const candidate = /^[A-Z]{2}$/.test(country) && !STRICT_TERRITORIES.has(country) ? country : 'EEA'
	const { analytics_storage } = resolveEffectiveConsent({ region: candidate })
	return Response.json(
		{
			region: analytics_storage === 'granted' ? 'ROW' : 'EEA',
			gpc:
				request.headers
					.get('Sec-GPC')
					?.split(',')
					.some((value) => value.trim() === '1') ?? false,
			ids: { ...googleTagIds(env), meta: metaPixelId(env) },
			stream: signalStreamConfig(),
		},
		{ headers: { 'Cache-Control': 'private, no-store' } },
	)
}
