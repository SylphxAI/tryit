# Where errors go

Puzzled sends server and browser errors to **Sylphx Observability**, our own
error-monitoring service, through the Sylphx SDK on `api.sylphx.com`
(`observability.errorGroups.capture`). There is no third-party error SDK,
script or host.

| Source | Path | Code |
| --- | --- | --- |
| Browser (uncaught errors, rejections, error boundaries, media failures, ineffective clicks and [CSP violations](reference/csp.md)) | same-origin `POST /api/observability/errors`; captured server side | `lib/observability/browser.ts`, `lib/observability/relay.ts` |
| Rust api (every 5xx, every panic) | axum middleware and panic hook | `crates/puzzled-server/src/observability/mod.rs` (`sylphx` crate) |

## Key and SDK route

- Capture calls `errorGroups.capture` with parent `orgs/-/projects/-/envs/-`
  (the key's own environment) and the environment's `SYLPHX_API_KEY`, which
  the platform mints and injects. The key needs `observability:ingest`.
  A key without that scope is refused with HTTP 403.
- Capture is a soft dependency: it never throws, gives up after 3 s, and never
  fails a request. A refused capture logs `[observability] capture failed`
  (web) or `observability capture failed` (api).

## Browser reports

The browser sends only a closed issue code, a fixed message, a route template,
a structural selector, and up to 15 recent navigation, click and HTTP-status
breadcrumbs. It keeps breadcrumbs in memory and attaches them only to an issue.
Each page attempts at most five reports per rolling minute, each at most 32 KiB
encoded. It sends no raw error messages, stacks, URLs, page content or user input.

The browser holds no key and posts only to the same-origin relay, without
cookies or a referrer. The existing relay attempts capture with the server key
when available. Its 204 response does not confirm that an event was stored.

The SolidStart build does not publish browser source maps; the web image
build rejects them in its public output. Browser reports do not include
stacks.

## Api reporter

`crates/puzzled-server/src/observability/mod.rs`. Each event carries service
(`SYLPHX_SERVICE_NAME`, default `api`), release (`SYLPHX_GIT_COMMIT_SHA`),
environment (`SYLPHX_ENVIRONMENT_TYPE`, as tag `environment`), the route
template as tag `route` (`unmatched` when no route matched; never the raw
path or query), kind, message and stack. Panics carry a backtrace (up to 50
frames, `app_frame` false for `/rustc/`, `.cargo` and registry paths).

- **Scrubbing**: before sending, message, stack strings and tag values lose
  emails, `Bearer`/`Basic` credentials, JWTs, `sylphx_`/`sk_`/`pk_`/`ghp_`
  style keys, values of `key=value` or `"key":"value"` pairs whose key
  contains secret, token, password, key, authorization or cookie, strings of
  32+ hex/base64 characters and 13-19 digit numbers (`[redacted]`).
- **Rate limit**: one fingerprint is sent at most once per 10 s per process;
  suppressed repeats are counted and logged at debug.
- **Queue**: events go through a bounded queue (64) to one worker. A full
  queue drops the event and logs `observability queue full or closed`
  with a running count, so if that line appears the api is erroring faster
  than the worker delivers. Each call times out after 3 s.
- **Off**: without `SYLPHX_API_KEY` the api logs
  `observability capture off: SYLPHX_API_KEY is not set` and only logs
  errors. Set the key (needs `observability:ingest`) and restart.

Verify after a deploy with the production check below, then
`sylphx observability error-groups list` (or the SDK read-back) and look for
the `observability test error <nonce>` group with the new release.

## Privacy

The service parses the raw stack and scrubs secrets, tokens, card numbers and
email addresses before storing. No request or response body and no header is
attached. The api reports the route template and status only. The
browser omits raw stacks and uses the fixed fields described above.

## Removed with the legacy host

The analytics (`/api/observability/analytics`) and session-replay
(`/api/observability/session-replays`) routes posted to the legacy
Observability host with `OBSERVABILITY_API_KEY`, which was never set, so they
never delivered. They, their hooks, the Web Vitals reporter and the game
analytics batcher are deleted.

## Consented Signal stream

Signal uses the environment's `SYLPHX_PUBLISHABLE_KEY` with `analytics:ingest`
on `SYLPHX_API_URL` (default `https://api.sylphx.com`). Both senders use
`POST /v1/analytics/events:batch`, a fresh request with `X-Sylphx-Key`, and
an explicit granted consent snapshot. GPC is enforced locally, not forwarded.

Browser Signal defaults on, subject to GPC and opt-out, only in US, CA, AU,
NZ, JP, HK, TW, SG, AE and IL. All other or unknown markets require a saved
analytics or full grant. The private consent context returns a policy flag,
not the country. Each committed public route visit sends one page view, with
no raw query or referrer, one in-memory session per uninterrupted period of
eligibility, and SDK-deduplicated campaign storage. Analytics-only never emits or retains click IDs. Checkout-start events
use the existing checkout consent snapshot and an ID derived from the Money
session, without player identifiers. Delivery is best effort with a 10 s timeout;
missing scopes, failed requests and exhausted capacity do not delay checkout.
The existing settled-conversion outbox is unchanged.

Browser funnel stages for ad optimisation use the same gate as page views
(`features/analytics/lib/signal-stages.ts`):

| Stage | Sent when | Properties (allowlisted) |
| --- | --- | --- |
| `game_start` | a playable daily or archive board is first shown | `game_slug`, `mode` |
| `game_finish` | the api accepted a finish (`valid`, matching status) | `game_slug`, `mode`, `status` |
| `plus_view` | a Plus offer card mounts, once per surface per page load | `entry_surface` |
| `checkout_started` | api, after Money creates the checkout (above) | `entry_surface` |
| `purchase` | the return page received the api's Money-settled receipt | `value`, `currency` |

`entry_surface` is the `trustedEntrySurface` enum; anything else is `other`.
`purchase` uses a SHA-256 of the processor order id as its event id (stable,
so a reload deduplicates); no order, player, auth or customer id is sent.

GA4 separately records a custom `game_start` for the first playable daily or
archive board of a visit. It requires an effective analytics grant: either an
affirmative choice already present when the board appeared or the server's
named opt-out market default with no saved choice. Delayed consent context can
confirm that same basis; opting in after seeing the board does not replay it.
Switching a board from the landing view to explicit Play does not count again;
a new visit can. Only GA4 receives it, with `game_slug`, `mode`, a query-free
public game URL, and no referrer. It is not an Ads conversion.

## First-party funnel counter

Visits, plays, sign-ups and Core Web Vitals are counted in our own database,
not by a third party. Rows are anonymous (no user id, no IP, no cookie), so the
counter runs without a consent choice. Google Analytics, when
`GA_MEASUREMENT_ID` is set, uses Signal’s regional cookie rules and is separate from the first-party counter.

| Event | Written by |
| --- | --- |
| `landing` | browser, once per session (`FunnelReporter`) |
| `game_start` | browser, when a playable board is shown (`createDailyPlayState`) |
| `signup` | api, in `RecordSignupAttribution`, once per new account |
| `web_vitals` | browser, `LCP` `CLS` `INP` `FCP` `TTFB` (`useReportWebVitals`) |

The browser posts same-origin ProtoJSON to the native Connect RPC
`POST /puzzled.v1.FunnelService/RecordEvent` (api implementation:
`crates/puzzled-server/src/bootstrap/funnel_event.rs`); the table is
`funnel_events`. Signup retries are deduplicated atomically by a separate
`funnel_signup_receipts` table (player id only, erased with the account); event
rows carry no player id. Web Vitals are document-load metrics, not soft-navigation
metrics. Only allowlisted public paths are retained, without locale/query/hash;
game-detail paths use the `/games/:slug` template and private paths are dropped.
Read browser events with SQL. This recipe excludes retired browser reports of
daily finishes, including rows retained across a mixed web/API rollout:

```sql
SELECT event, count(*) FROM funnel_events
WHERE occurred_at > now() - interval '1 day'
  AND (event <> 'game_complete' OR params->>'mode' IN ('archive', 'practice'))
GROUP BY 1;
SELECT metric, percentile_cont(0.75) WITHIN GROUP (ORDER BY value) AS p75
FROM funnel_events WHERE event = 'web_vitals' GROUP BY 1;
```

### Daily finishes

Run the [daily completion query](../crates/puzzled-server/src/capabilities/funnel/daily_completions.sql)
using the approved Tryit read-only database connection. It takes one Hong Kong
product day (`YYYY-MM-DD`). For example, with that connection already selected
in your PostgreSQL client environment, from the repo root:

```bash
set -o pipefail
{
  echo "BEGIN READ ONLY; SET LOCAL statement_timeout = '5s'; PREPARE daily_finishes(text) AS"
  cat crates/puzzled-server/src/capabilities/funnel/daily_completions.sql
  printf "EXECUTE daily_finishes('%s');\nROLLBACK;\n" '2026-11-26'
} | psql -X -v ON_ERROR_STOP=1
```

Sum the returned `finishes` for the day, not browser events. Each qualifying
committed win or loss contributes one; the same player can finish multiple games.
The output distinguishes puzzle and entertainment ritual classes. It excludes
registered fixtures (including the recorded guest origin) and verification-marked
finishes. Archive, practice and the distinct-player [North Star](metrics.md) are
separate measures. This is a read of current retained sessions, not a new event
log or an immutable historical total; erasure and provenance changes can affect it.

Identity is derived from existing server evidence at read time, not from a
browser status lookup. Adoption or legacy-claim provenance proves guest origin
and takes precedence over the new owner's account mapping. Otherwise, an Auth
mapping or guest credential already created by the stored finish timestamp
establishes that bucket if the other is absent. Missing, later-only or conflicting
evidence remains `unknown` and still counts in the total. No player ID, exact time,
or pick attribution is returned. Existing consent-gated GA is unchanged.

## Quality signals

The api reports its own problems as structured log lines; the platform turns
them into work items without anyone reading a log. Puzzled only writes the lines.

| Line | When | Becomes |
| --- | --- | --- |
| `event="puzzled.issue.turn_failed.<route>" severity="info"` | any 5xx the caller saw | one work item per fingerprint (from `ProductIssueReported`); a repeat while it is open is a note, a return after it closed a new item |
| `event="puzzled.user.write.ok\|failed" severity="info"` | one per finished user-mutating Connect RPC; HTTP 5xx fails it | the shared `product-journey-success` journey SLO (journey `puzzled.user.write`) |

The route subject is the route template with its parameters removed
(`/v1/puzzles/{game}/…` → `v1_puzzles…`), so no id, game slug or body ever
enters a line. The code is in
`crates/puzzled-server/src/shared/signals.rs`; the middleware is layered once
in `crates/puzzled-server/src/bootstrap/router.rs`.

The user-write journey enumerates submissions, result shares, profile and
notification changes, account erasure, signup attribution, billing actions
and streak changes. Connect read-only RPCs also use POST; `GetDaily`,
`GetPuzzle`, `CheckGuess`, stats and other reads never count as writes.
Admin, jobs, Compute ticks, guest bootstrap and induction are excluded.
Client rejections do not count as availability failures. The old
`puzzled.api.write.*` events are no longer emitted or selected by the SLO.
Ten failed submissions therefore count ten writes and ten failures (100%),
regardless of 1,000 successful reads.

The induction handler supplies its nonce subject to the outer observer;
it does not emit a second route fingerprint. Two calls with the same nonce
produce two occurrences of one fingerprint and no user-write events.

Read back after a deploy (the same `SYLPHX_API_KEY`):

```bash
# Induced issue: answers 503 and reports one issue. Call once, then again
# within the hour, and read one item then one note in the work system.
curl -X POST https://puzzled.gg/signals:induce \
  -H "authorization: Bearer $SYLPHX_API_KEY" -d '{"nonce":"qa1"}'
```

## Production check

Both services have a test trigger that fails on purpose with
`observability test error <nonce>`. Without `authorization: Bearer <SYLPHX_API_KEY>`
it answers 404.

```bash
# web: the handler throws; onRequestError captures it.
curl -X POST https://puzzled.gg/api/observability/test \
  -H "authorization: Bearer $SYLPHX_API_KEY" -d '{"nonce":"n1"}'
# api: a task panics (panic hook) and the response is 500 (5xx middleware).
curl -X POST https://puzzled.gg/observability/test \
  -H "authorization: Bearer $SYLPHX_API_KEY" -d '{"nonce":"n2"}'
```

Read back with the same key:

```ts
import { Sylphx } from '@sylphx/sdk'
const sx = new Sylphx()
await sx.observability.errorGroups.list({ parent: 'orgs/-/projects/-/envs/-', pageSize: 50 })
```

## Overview latency

The today-overview database and outer request phase timings, fixed-cohort
baseline and all-status follow-up method are documented in
[today-overview-performance.md](reference/today-overview-performance.md).

## Signup session completion

The unified sign-in route handles email-code account creation. A successful
proof is exchanged for a server-held session; current policy acceptance must
be recorded before the browser receives the session cookie. The old password
signup endpoint is not served.
