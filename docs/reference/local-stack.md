# Local full-stack check (`scripts/local-stack.ts`)

Run the [verification harness](live-verification.md) against the local Rust API,
SolidStart web app and a scratch Postgres database. The ingress loads the API
service's `path_prefixes` from [`sylphx.toml`](../../sylphx.toml). Exact paths
and their slash-delimited descendants go to the API; everything else goes to
web. For example, `/observability/test` routes to the API, while
`/api/observability/test` routes to web. Do not trigger either to check routing.

## Layer

This is a **Local** check, not a Live claim. It answers "is the product loop
correct in the revision I built?" while the platform Release path is what
answers "is production serving it?". A green local run does not verify a
deploy. Use the explicit loopback base below for local checks; omitting
`--base` targets production.

To check routing alone, run `bun test --isolate scripts/local-stack.test.ts`.
It uses the actual ingress and two disposable loopback listeners. It does
not require Postgres, credentials, production traffic or live measurement.

Use it when:

- the deployed revision is older than the fix you want to verify, and you need
  the same assertions to be falsifiable *now*;
- a change touches the finish loop (submit / terminal / one-finish-per-day /
  completion check) and unit tests alone would not prove the wiring;
- you want the post-deploy expectations from
  [`live-verification.md`](live-verification.md) rehearsed before a Promote.

## Requirements

- `bun`, `cargo`, and the `atlas` CLI on PATH (see the repo root `AGENTS.md`).
- A **scratch** Postgres database. Never point `DATABASE_URL` at a database
  that serves players: the `--play` run writes a real guest finish row.
- Node/Cargo dependencies installed (`bun install`, and the crate builds).

## Steps

```bash
# 1. Scratch database + schema (Atlas is the only migration writer).
psql -h localhost -U postgres -c 'CREATE DATABASE puzzled_local_check;'
export DATABASE_URL="postgres://postgres:postgres@localhost:5432/puzzled_local_check?sslmode=disable"
atlas migrate apply --dir file://apps/puzzled/atlas/migrations --url "$DATABASE_URL"

# 2. Rust API — use a debug build, with the ingress as its browser origin.
#    Use only scratch configuration; do not supply live service credentials.
PUZZLED_HTTP_PORT=8787 PUZZLED_PUBLIC_URL=http://127.0.0.1:9999 cargo run -p puzzled-server &

# 3. SolidStart — in a separate terminal, run without DATABASE_URL.
(cd apps/puzzled && env -u DATABASE_URL API_INTERNAL_URL=http://127.0.0.1:8787 \
  SYLPHX_PUBLIC_URL=http://127.0.0.1:9999 bun run dev)

# 4. Ingress — in another terminal, start the loopback proxy.
PUZZLED_API_PORT=8787 bun run local:stack

# 5. Verify the local stack, not the production default.
bun run verify:live --base http://127.0.0.1:9999 --json
```

Use the ingress origin for both web and API requests so guest cookies stay
on the same origin. Add `--play` only against the scratch database. This
run does not prove production host, HTTPS, or live provider behavior.

## What the local run can and cannot assert

| Check | Locally | Why |
| --- | --- | --- |
| `free-slug-discovery`, `daily-serve`, `archive-open` | pass | Real GetDaily against the real schema and rotation. |
| `finish-loop` (with `--play`) | pass with a playable scratch stack | Terminal recorded, `hasCompleted` on re-read, second submit refused `already_played`. |
| `web-document`, `marks-scan` | pass | The web layer is what renders canonical/JSON-LD/CTA; loopback targets are accepted as-is. |
| `share-deep-link` | `unknown` | The harness cannot solve the free module, so the solution signature stays unknown; the landing-page shape and non-spoiler checks still run. |
| `healthz` `revision-sha` | pass | The api probes return only `{"status":"ok"}`; the revision is the router's `x-revision-sha` header, which `local-stack.ts` stamps from `git rev-parse HEAD`. |

## What a green local `finish-loop` proves

`SubmitGuess` → `200 valid=true status=lost` (a give-up is a terminal,
not an "Invalid win claim"), `GetDaily` re-read → `hasCompleted=true` with the
completed session, and a second terminal → `409 already_played`. The harness
writes a real ritual finish but marks it as verification traffic, so it does
not contribute to [daily puzzle completers](../metrics.md#recomputing-it). The
migrated database tests check the North Star against both marked and unmarked
finishes.
