import 'server-only'

import { headers } from 'next/headers'
import { canonicalSiteOrigin } from './site-origin-request'

export async function getCanonicalSiteOrigin(): Promise<string> {
	return canonicalSiteOrigin(await headers())
}
