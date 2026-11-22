import { consentRegion } from '@/features/analytics/lib/consent-region'
import { googleTagIds } from '@/features/analytics/lib/google-tag'
import { env } from '@/lib/env'

// The HTML and its cache key stay independent of geography and GPC. Return
// only the policy bucket, never the raw country or IP address.
export function GET({ request }: { request: Request }) {
	return Response.json(
		{
			region: consentRegion(request.headers.get('CF-IPCountry')),
			gpc: request.headers.get('Sec-GPC') === '1',
			ids: googleTagIds(env),
		},
		{ headers: { 'Cache-Control': 'private, no-store' } },
	)
}
