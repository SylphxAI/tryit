import { relayBrowserError } from '@/lib/observability/relay'

/** Browser error relay into Sylphx Observability (docs/observability.md). */
export const POST = relayBrowserError
