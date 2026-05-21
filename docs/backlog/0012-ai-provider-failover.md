---
id: 0012
title: Make multi-provider AI failover real — when the primary provider errors, callAI() retries a fallback
status: shipped
priority: P1
area: ai
created: 2026-05-21
owner: product-groomer
---

## User story

As a coach generating a parent report or a session debrief at 9pm after practice, I want
the AI to still produce my artifact even when one provider is having an outage, so that a
transient Anthropic/OpenAI/Gemini hiccup doesn't turn into a dead "Generation failed" wall
that makes me think the app is broken and walk away.

## Why now (four lenses)

### Product Owner
The README and AGENTS.md both name "multi-provider AI routing with failover competitors
can't easily replicate" as a core moat — but the code doesn't actually fail over. `callAI()`
in `src/lib/ai/client.ts` resolves exactly ONE provider via `getConfiguredProvider()`
(org-preferred key, else first available key, else env var), calls it, and on any error logs
a `status:'error'` row to `ai_interactions` and rethrows (see the `catch` at ~line 520). A
single provider blip becomes a hard user-facing failure on the most valuable paths (parent
report, session debrief, practice arc, weekly star). The smallest meaningful unit of value
is: when the primary provider call throws a retryable error, try the next configured/available
provider once before giving up. The coach gets their artifact; the failure becomes invisible.

### Stakeholder
This is the highest-leverage moat-deepener available because it makes the *advertised* moat
true. Failover is exactly the thing a single-provider competitor can't bolt on cheaply, and
it's the thing we already claim and bill against (tier-aware quota + provider routing). Right
now the claim is aspirational; this ticket makes it real and observable in `ai_interactions`
(a failed-primary row AND a succeeded-fallback row for the same logical request). It also
protects every downstream artifact and the parent-portal viral loop: a report that fails to
generate is a screenshot that never gets shared. Reliability on the AI path is the substrate
the whole product sits on.

### User (at 9pm, tired, on home wifi, tapping "Generate")
The coach taps Generate. Behind the scenes the primary provider 529s. Instead of a red error,
the platform quietly tries the fallback and the report appears — maybe a second slower, but it
appears. The coach never learns there was an outage; they just got their report. Failover must
NOT change the quota math (a request that ultimately succeeds counts as one successful AI call
against the free-tier cap, never two) and must NOT retry on a quota/rate-limit refusal (those
are not provider outages — they're the product working as designed).

### Growth
This is a retention-and-trust lever, not a viral artifact. The day a coach hits "Generation
failed" twice is the day they decide the app is flaky and stop opening it; failover removes
that churn trigger on the single most-used premium path. It compounds the free-tier usage
meter (0008): a free coach with 1 AI note left who taps Generate and gets a hard provider
error has burned trust for nothing — failover means their scarce call actually lands. Quiet
reliability is what makes a coach come back tomorrow.

## Acceptance criteria

Each box maps 1:1 to a vitest scenario (this is a `src/lib/ai/client.ts` contract; the proof is unit/contract tests, not a UI flow).

- [ ] When the primary provider call throws a retryable error (e.g. HTTP 500/502/503/529 or a network error) AND a second provider key is available, `callAI()` calls the fallback provider and returns its successful result instead of throwing (vitest: mock `callProvider` so the first provider rejects and the second resolves; assert the returned `text` is the fallback's).
- [ ] A successful failover logs BOTH outcomes to `ai_interactions`: a `status:'error'` row for the failed primary (with its `model`/`error_message`) AND a `status:'success'` row for the fallback (with the fallback's `model` and token counts). The returned `interactionId` is the SUCCESS row's id (vitest asserts two inserts and the returned id).
- [ ] Quota counts the request once: a failover that ultimately succeeds increments the free-tier monthly `success` count by exactly 1, not 2 (vitest: the failed-primary row is `status:'error'` so the existing month-count query — `.eq('status','success')` — already excludes it; assert the success count delta is 1).
- [ ] `callAI()` does NOT fail over on a `TierLimitError` or `RateLimitError` — those are thrown before/around the provider call and must propagate unchanged (vitest: a free org over its monthly cap still throws `TierLimitError` and makes zero provider calls; a per-coach rate-limit refusal still throws `RateLimitError`).
- [ ] `callAI()` does NOT fail over on a non-retryable provider error such as 401/invalid-API-key (a bad key won't be fixed by retrying another bad-or-absent key path); it logs the error and rethrows as today (vitest: a 401 from the only/primary provider rethrows without a second provider call).
- [ ] When NO fallback provider is available (only one key configured), behavior is unchanged: the single provider's error is logged and rethrown exactly as today (vitest regression: single-key org still surfaces the original error).
- [ ] Fallback ordering is deterministic and key-gated: the fallback is the next provider (among `anthropic`/`openai`/`gemini`) that has a usable key in org settings or env, excluding the already-failed primary; a provider with no key is skipped (vitest asserts the chosen fallback given a seeded key set).
- [ ] AI contract test (`tests/ai/`) still passes for the existing JSON-producing prompts under at least Anthropic and one fallback provider — `callAIWithJSON()`'s parse path is unaffected by the failover wrapper (regression).

## Out of scope

- Retrying the SAME provider N times (exponential backoff against one provider). v1 is a single cross-provider failover, not a retry-storm.
- Chaining through all three providers. One fallback attempt after the primary is the v1 contract; if both fail, throw. (A configurable provider chain can follow if data shows it's worth it.)
- Changing `getConfiguredProvider()`'s primary-selection priority (org preferred → any org key → env). Failover picks the *next* eligible provider; primary selection is unchanged.
- Per-org failover opt-out, a circuit breaker, or provider health tracking. Out of scope for v1; failover is always-on and stateless per request.
- Changing the dedup cache, cost logging, or model-selection logic beyond what failover requires (the fallback uses that provider's default/cost-effective model exactly as a normal call would).
- Surfacing "we failed over" in the UI. The whole point is that it's invisible to the coach; no banner, no toast.
- Any new env var or provider. Failover only uses providers whose keys are already configured.

## Engineering notes

- `src/lib/ai/client.ts` — the change is localized to the `try/catch` around `callProvider()` inside `callAI()` (~lines 467–537). On catch: if the error is a `TierLimitError`/`RateLimitError`, rethrow immediately (those are thrown by the quota/rate-limit guards, not the provider). Otherwise classify the provider error as retryable (5xx / 529 / network) vs not (401/invalid key, 400 bad request). If retryable AND a fallback provider exists, resolve the fallback key, log the failed-primary `status:'error'` row (as today), then call `callProvider(fallback, ...)` and run the existing success path (cost log, `status:'success'` insert, cache write, return). If the fallback also throws, log its error row and rethrow.
- Fallback resolution: extend `getConfiguredProvider()` (or add a sibling `getFallbackProvider(supabase, orgId, exclude: AIProvider)`) that returns the next provider with a usable key in `organizations.settings.ai_keys` or env, excluding the failed primary; return `null` when none. Keep the org-key-first, env-fallback precedence consistent with the existing resolver.
- Error classification helper: a small pure function (e.g. `isRetryableProviderError(err)`) — Anthropic/OpenAI SDK errors expose `.status`; treat `>=500` or `429`-as-server (careful: the Anthropic/OpenAI 429 is provider-side rate limiting, which IS a retryable-on-another-provider case, but the existing code maps `error.status === 429` to `status:'rate_limited'` for logging — preserve that logging label while still allowing failover) and network errors as retryable; treat 400/401/403 as non-retryable. Keep this function unit-testable in isolation.
- Logging contract: keep using the existing `ai_interactions` insert shape. The failed-primary row keeps `status: error.status === 429 ? 'rate_limited' : 'error'`. The fallback success row is the normal `status:'success'` insert. Do NOT collapse them into one row — two rows is the observable proof of failover and the audit trail.
- Quota: no change needed to the count query — it already filters `.eq('status','success')`, so the failed-primary row is naturally excluded. Just assert this holds.
- AI calls must still go ONLY through this client (AGENTS.md rule 4). Do not add provider SDK imports to any route; all three SDKs are already imported here.
- `tests/ai/provider-failover.test.ts` (new, `.test.ts` NOT `.spec.ts` — LESSONS.md). Mock `callProvider` (or the per-provider `callAnthropic`/`callOpenAI`/`callGemini`) and a chainable in-memory Supabase (same pattern as `tests/ai/usage.test.ts` / `tests/api-routes.test.ts`) to assert: failover-success returns fallback text + logs two rows; quota delta of 1; `TierLimitError`/`RateLimitError` propagate with zero provider calls; 401 rethrows without failover; single-key org unchanged; deterministic fallback selection.
- Run the gate under Node 20.19.0 by prepending its bin to PATH (LESSONS.md 2026-05-21): `N20="$HOME/.nvm/versions/node/v20.19.0/bin"; PATH="$N20:$PATH" npx vitest run tests/ai/provider-failover.test.ts`. The local full suite has known environmental fails (Node 25 / TZ); CI Node 20 arbitrates.
- New deps: no. Migration: no. Env vars: no. AI prompt change: no (this is the transport layer, not a prompt). Tier feature key: no.

## Implementation log

(Appended by the implementation-dev agent during execution.)

- 2026-05-21 — branch `feat/0012-ai-provider-failover` opened
- 2026-05-21 — failing test added in `tests/ai/provider-failover.test.ts` (14 scenarios mapping all 8 ACs: pure `isRetryableProviderError` classifier, failover-success returns fallback text, two-row audit trail with success id, quota delta of 1, TierLimitError/RateLimitError propagate with zero provider calls, 401 rethrows without failover, single-key org unchanged, key-gated deterministic fallback selection skipping keyless providers, env-key fallback precedence, both-fail rethrows fallback error). Confirmed failing for the right reason (no failover + missing classifier export).
- 2026-05-21 — implemented in `src/lib/ai/client.ts`: exported pure `isRetryableProviderError(err)` (>=500/529/429/network = retryable; 400/401/403 = not), added `getFallbackProvider(supabase, orgId, exclude)` (next anthropic→openai→gemini with a usable org/env key, excluding the failed primary, null if none), and rebuilt the `callAI` try/catch to extract reusable `recordSuccess`/`recordError` closures: on catch, rethrow TierLimitError/RateLimitError immediately, always log the failed-primary row, then if retryable AND a fallback exists, call the fallback and run the normal success path (cost log, success insert, cache, return success-row id); if the fallback also throws, log its error row and rethrow. `getConfiguredProvider()` primary selection unchanged; quota count query untouched. Local gate green under Node 20.19.0: lint 0 errors, tsc 0 errors, `tests/ai/` 45/45.
- 2026-05-21 — PR #241 opened (https://github.com/mutaaf/courtiq/pull/241), auto-merge armed; gating checks `lint` / `unit-tests` / `e2e-tests` all green (Vercel rate-limit fail ignored per LESSONS.md — non-gating).
- 2026-05-21 — merged to main (squash `333f018`). Ticket + README index row flipped to `shipped`.
