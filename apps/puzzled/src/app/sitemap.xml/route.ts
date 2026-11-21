import { serveSitemap } from '@/lib/seo/sitemap'
import { getServerBaseUrl } from '@/lib/utils'

export function GET() {
	// Use the deployment's origin, never the request host or a session.
	return serveSitemap(getServerBaseUrl())
}
