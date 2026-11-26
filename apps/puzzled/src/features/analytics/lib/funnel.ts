/**
 * First-party funnel counter (browser side). Posts anonymous events to the
 * api's native Connect FunnelService: no cookie, no user id, no third party, so it runs
 * without a consent choice. Never throws and never blocks the page.
 */
import { create, toJsonString } from '@bufbuild/protobuf'
import { RecordEventRequestSchema } from '@/gen/connect/puzzled/v1/funnel_pb'
import { resolveConnectBaseUrl } from '@/lib/connect/transport'
import type { BehavioralEvent } from './behavioral-events'

export type FunnelEvent =
	| BehavioralEvent
	| { event: 'landing'; path: string }
	| { event: 'share_landing' }
	| { event: 'game_start'; game_slug: string; path?: string }
	| {
			event: 'web_vitals'
			metric: 'LCP' | 'CLS' | 'INP' | 'FCP' | 'TTFB'
			value: number
			rating?: string
			path?: string
	  }

export const FUNNEL_PATH = '/puzzled.v1.FunnelService/RecordEvent'

/** The path without locale prefix is not needed: the raw pathname is stored, query and hash dropped. */
export function funnelUrl(base: string): string {
	return `${base.replace(/\/+$/, '')}${FUNNEL_PATH}`
}

export function sendFunnel(
	payload: FunnelEvent,
	send: typeof fetch | undefined = typeof fetch === 'function' ? fetch : undefined,
): void {
	if (!send || typeof window === 'undefined') return
	try {
		void send(funnelUrl(resolveConnectBaseUrl()), {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'Connect-Protocol-Version': '1' },
			body: toJsonString(
				RecordEventRequestSchema,
				create(RecordEventRequestSchema, {
					event: payload.event,
					path: 'path' in payload ? payload.path : undefined,
					metric: payload.event === 'web_vitals' ? payload.metric : undefined,
					value: payload.event === 'web_vitals' ? payload.value : undefined,
					rating: payload.event === 'web_vitals' ? payload.rating : undefined,
					gameSlug: 'game_slug' in payload ? payload.game_slug : undefined,
					mode: 'mode' in payload ? payload.mode : undefined,
					// Save-streak analytics use the existing wire status enum; storage calls it outcome.
					status:
						'outcome' in payload
							? payload.outcome
							: 'status' in payload
								? payload.status
								: undefined,
					pickIndex: 'pick_index' in payload ? (payload.pick_index ?? undefined) : undefined,
					timeBucketS: 'time_bucket_s' in payload ? payload.time_bucket_s : undefined,
					isGuest: 'is_guest' in payload ? payload.is_guest : undefined,
					progressPctBucket:
						'progress_pct_bucket' in payload ? payload.progress_pct_bucket : undefined,
					hintCount: 'hint_count' in payload ? payload.hint_count : undefined,
					action: 'action' in payload ? payload.action : undefined,
					hasPercentile: 'has_percentile' in payload ? payload.has_percentile : undefined,
					surface: 'surface' in payload ? payload.surface : undefined,
					picksUsed: 'picks_used' in payload ? payload.picks_used : undefined,
					currency: 'currency' in payload ? payload.currency : undefined,
					platform: 'platform' in payload ? payload.platform : undefined,
					trigger: 'trigger' in payload ? payload.trigger : undefined,
					result: 'result' in payload ? payload.result : undefined,
				}),
			),
			keepalive: true,
			credentials: 'omit',
			referrerPolicy: 'origin',
		}).catch(() => {})
	} catch {
		// A counter never breaks a page.
	}
}
