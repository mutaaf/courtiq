# Strategy Audit — 2026-06-15

> Audit-only memo. No tickets written, no statuses changed.

## Preflight: the premise is partly wrong

Before the audit proper: your recollection of the 2-week shipping window is
materially off, and that matters for the conclusion.

- Highest ticket id on disk is **0053**, not 0083. See
  `/Users/mutaafaziz/Desktop/projects/courtiq/docs/backlog/` — the directory
  ends at `0053-delete-a-team-from-an-organization.md`.
- Tickets in the contiguous run 0054–0083 **do not exist** in this repo. No
  files, no commits, no PRs.
- Of the tickets you specifically named, **0047, 0048, 0049, 0050 are still
  `groomed`, not shipped.** Their `Implementation log` sections are empty
  template placeholders ("YYYY-MM-DD — branch `feat/…` opened"). See e.g.
  `/Users/mutaafaziz/Desktop/projects/courtiq/docs/backlog/0047-referral-conversion-celebration.md:252`.
- What actually shipped in the recent window (per `git log --oneline` and
  ticket frontmatter): **0040, 0041, 0042, 0044, 0045, 0046, 0051, 0052,
  0053** — nine tickets, not thirty. The README index in
  `docs/backlog/README.md` is also stale (only lists through 0053 and groups
  0048-0050 as groomed) which corroborates the disk truth.

The strategic theme you identified — coach-to-coach / parent-to-parent viral
loops — IS real in the **groomed** stack (0047/0048/0049/0050 are all on this
axis) but it is largely a *plan*, not a *fait accompli*. The loop has been
quieter than you think, not louder. I'll audit what actually shipped.

---

## Part 1 — What actually shipped

Spot-checking the recent network-effect-adjacent tickets:

### 0044 — Drill-sequence network suggestions (SHIPPED)

End-to-end? **Half-loop only, by design.** Migration `045_drill_sequence_aggregates.sql`,
nightly cron at `/api/cron/refresh-drill-sequences` (vercel.json:27), and a
GET `/api/drill-sequence-suggestions` route exist. The k-anonymity floor
(`coach_count >= 5`) is enforced at the route layer, not just in the UI —
`src/app/api/drill-sequence-suggestions/route.ts:25` hard-codes `FLOOR = 5`
above the SELECT. Auth-required, returns only the documented 4-key payload.
The "publishing" half (a coach being TOLD their drill seeded N other coaches'
plans) is not built; this is a one-way recommender, not a feedback loop. That
is fine for v1 but worth naming: it's a *suggestion* network, not a *credit*
network.

### 0041 — Weekly parent reactions rollup (SHIPPED)

End-to-end? **Yes.** Cron `/api/cron/weekly-parent-rollup` scheduled
`5 8 * * 1` (vercel.json:20), reuses the 0023 digest's auth + dedup
primitives, and the `src/lib/weekly-parent-rollup-utils.ts` is honest about
the COPPA boundary in its own docstring ("never reads a `players` row, so the
route's narrow SELECT … is the COPPA boundary"). The email body quotes
parents verbatim with HTML-escaping (`esc()` at line 125) — no AI rewrite, no
hype words. Voice is clean: "Hey {firstName}", "12 parents reacted this
week" — no banned tokens.

### 0042 — Coach quiet check-in + universal pause (SHIPPED)

End-to-end? **Mostly yes, with one gap.** Migration
`042_coaches_paused_until.sql` lands the column, the cron at
`/api/cron/coach-quiet-check-in/route.ts` sends the HMAC-signed pause link,
and **every existing cron now imports `isCoachPaused()` as the universal
short-circuit** (verified: it's referenced in weekly-digest, parent-digest,
practice-reminder, weekly-parent-rollup). This is the kind of
surface-area-reduction the LESSONS file would call moat-shaped.

The gap: **the new cron is not scheduled in `vercel.json`.** Look at the file
— six cron entries, none of them `/api/cron/coach-quiet-check-in`. The route
exists and is reachable by a manual `Bearer ${CRON_SECRET}` POST, but on
production no scheduler fires it. The quiet-check-in is currently a feature
on the disk, not in users' inboxes. (The Implementation log doesn't flag
this — the ticket's AC enumerates the route's behavior, not the cron entry.)

### 0046 — Sideline cheat sheet (SHIPPED)

Card is gated client-side via `<UpgradeGate>` on
`src/components/home/sideline-cheat-sheet-card.tsx`. The migration
(`044_plans_type_sideline_talking_points.sql`) widens the `plans_type_check`
constraint per LESSONS#54. Voice in the prompt instruction is positive — no
"amazing"/"exciting" tokens. Server-side gate paired (per the standard
`canAccess()` pattern). No deferred hacks in the log.

### 0045 — Unfinished drills rollover (SHIPPED)

Pure carryover into the plan generator's context. Adds
`043_plans_completed_drills.sql`. No new public surface; no email; no
gating change. The kind of compounding-quality ticket that has no growth
flag but raises the floor of every shipped artifact downstream. Clean ship.

### 0051 / 0052 / 0053 — Delete a practice / next-season roster / delete a team (SHIPPED)

These are NOT network-effect tickets — they're the **destructive-action
hardening pass** the platform needed to be a credible coach-of-record tool.
0051 introduces a typed `/api/sessions/[sessionId]` DELETE that the generic
`/api/data/mutate` denies for sessions/teams/players; 0052 ships the
`/api/season/rollover` carry-forward; 0053 extends the typed-delete primitive
to teams. LESSONS#97 (in `docs/LESSONS.md`) calls this out: "the denial
primitive belongs in the SAME PR as the typed endpoint — never as a
follow-up." The dev agent did the audit-of-existing-callers and confirmed
all 7 existing `operation: 'delete'` callers are safe before landing the
deny.

### Quiet hacks deferred (the compounding ones)

- **`/api/cron/coach-quiet-check-in` has no scheduler entry in
  `vercel.json`** (above). Compounds with 0041's effectiveness because the
  quiet-check-in IS the deliverability backstop the other crons depend on.
- **Tier feature key drift** (LESSONS#78, 2026-05-23) is still live: the
  registered feature keys mix `feature_*` prefixed (digest, season-momentum,
  pregame-brief, program-pulse, program-focus) with bare (`analytics`,
  `assistant`, `media_upload`, `parent_sharing`, `report_cards`,
  `multi_coach`, `tendencies`). Two naming conventions in one file means a
  groomer ticket that says `feature="X"` may resolve to either, depending on
  which list the dev grepped. No ship has weakened it; nobody has fixed it
  either.
- **The `<UpgradeGate>` on the `capture/review` page (line 450) uses
  `feature="Observation AI Processing"`** — a free-text label, not a tier
  key registered in `TIER_LIMITS` or `FEATURE_CONFIG`. `canAccess(tier,
  "Observation AI Processing")` always returns `false`, so the gate ALWAYS
  blocks for everyone. Either it's intentionally a hard wall (then it
  shouldn't be wrapped in `UpgradeGate`), or it's a typo that silently
  caught a wider audience than intended. Either way it's not the contract
  AGENTS.md describes.

---

## Part 2 — What's under-served

### Free → Paid conversion friction: real, and unaddressed

`grep` shows **exactly 10 `<UpgradeGate>` placements** in `src/app/`. Of
those, only **two** sit on a high-frequency coach surface: the `/assistant`
page (gated to pro_coach) and the `/plans` pre-game brief CTA. The rest gate
secondary surfaces (analytics, photo capture, report cards, parent sharing
on the player profile, the org settings program-focus card).

The high-intent conversion moments the recent loop SHOULD be creating —
"coach just hit the 5-call free AI wall on the artifact they were about to
share" — are gated by 0035 (the quota-wall resume), which shipped. Good.
But the LOOP-DRIVEN intent moments are not yet gated anywhere:

- 0046 sideline cheat sheet, 0048 (groomed) postgame texts, 0049 (groomed)
  plan publish-and-clone — the artifacts a coach makes after seeing them in
  the wild — are universal across tiers, with no upgrade hook the moment
  they're attempted at scale.
- The 0044 drill suggestions are deliberately free for moat reasons. Fine.
  But the *next* surface a coach hits after acting on a suggestion (the
  generated plan, the practice itself) is the conversion moment, and we
  don't capture it.

The product has built ten viral surfaces in the last quarter and roughly
zero conversion gates that fire on the artifacts those surfaces produce.

### Billing hardening: webhook is good, prod verification is not

`src/app/api/stripe/webhook/route.ts` is 247 lines and handles all five
critical events: `checkout.session.completed`, `customer.subscription.{created,
updated,deleted}`, `invoice.payment_failed`. Signature verification is
mandatory (line 50-52: `STRIPE_WEBHOOK_SECRET` → 503 if absent — fail-closed,
not fail-open). The cache-bust on every billing mutation (`bustOrgMeCache()`)
is in place per LESSONS#41.

This is competent code. What I can't verify from the audit:
- Whether the prod `STRIPE_WEBHOOK_SECRET` is currently set in Vercel.
- Whether the `stripe_webhook_events` table (migration 028) is actually
  being written to in prod, or whether the webhook is silently 503'ing.
- Whether the `customer.subscription.created` fallback to `sub.metadata.org_id`
  (LESSONS#47) has ever fired against a real first-time customer.

No `chore/0074` or similar billing-hardening ticket exists — 0001 + 0002 +
0003 + 0004 + 0005 are the only billing tickets, all shipped a month ago.
Nothing recent has touched the webhook. That's either "it's working fine"
or "nobody is looking" — and without a prod-status check or a synthetic
test that hits the real webhook on a schedule, we can't tell which.

### Privacy / COPPA: held the line, mostly

The 5 new outbound email senders (drip, practice-reminder, weekly-digest,
weekly-parent-rollup, coach-quiet-check-in) all `sendEmail({ to: coach.email,
... })` — the coach's own email, never a parent's, never a player's. The
parent-digest (the only minor-data path) goes `to: player.parent_email`, the
contact the parent themselves filed.

The rollup email's util file (`src/lib/weekly-parent-rollup-utils.ts:6-12`)
is explicit about the SELECT being the COPPA boundary — the four columns
(`reaction, message, parent_name, created_at`) are typed and listed
*specifically so that a future widening fails the test*. That is the
construction AGENTS.md asks for.

One real gap: the groomed-but-not-shipped 0050 (parent → program director
referral) proposes an outbound email TO a third party the parent typed in
freehand, with the parent's own first name and an optional note in the
body. The ticket is careful (no minor name, HMAC-signed director id,
rate-limited, dedup-hashed). But it crosses a line none of the shipped
crons cross — *we send mail to someone who has never given us consent.*
That deserves an explicit privacy review before it ships, not just a
"voice contract" check. It's currently labeled `area: growth` priority P2
in `0050-parent-to-program-director-referral.md`.

The `weekly-parent-rollup` email's HTML body quotes parents verbatim
(`<li class="quote"><span class="who">${who}:</span> ${body}</li>`) — that's
the *coach's* inbox, not a third party's, so it's defensible, but it does
mean any parent who taps the reaction button on the public portal now sees
their first name + message body cross into an email. The ticket's
`Out of scope` doesn't address whether parents are told this on the portal.
That's a reasonable thing to add, not a regression.

### Observability: shipping blind

Every new cron logs to `console.error` / `console.log`. Grep
`/Users/mutaafaziz/Desktop/projects/courtiq/src/app/api/cron/` —
`weekly-parent-rollup/route.ts` and `coach-quiet-check-in/route.ts` both
do exactly:
```
console.error('[weekly-parent-rollup] send failed:', coach.email, result.error);
...
console.log('[weekly-parent-rollup] ...');
```

That is the entirety of the observability story for the viral loops. Vercel
function logs are searchable; there is no metric, no counter, no aggregation,
no "this week N coaches got the digest, M opened it, K converted." A
referral-celebration card (0047) can ship and we will have no in-product
way to know if it caused another referral to fire.

The ticket bodies' "Implementation log" sections also do not record any
post-deploy verification — "deployed 2026-05-26, first real cron fire at
08:00 on 2026-05-30 sent 17 emails to 17 coaches" is the kind of line that
would tell us the loop landed. We do not have it.

### Tier math: held the line

`src/lib/tier.ts` — Free is still 1 team, 1 sport, 10 players, 5 AI calls
per month. None of the recent growth tickets weakened these. The 0035
quota-wall + 0008 usage meter make the wall *visible* but the wall itself
is unchanged. The feature lists *grew* (`feature_weekly_digest`,
`feature_season_momentum` on Coach+, `feature_pregame_brief` on
pro_coach+, etc.) but no feature got *demoted to free*.

This is the right answer. The thing that did happen is the keying drift
flagged above (`feature_*` vs bare) — a real source of "this gate doesn't
do what the ticket said" bugs (the `capture/review` `feature="Observation
AI Processing"` is exactly that).

---

## Part 3 — Recommendation

**`/ideate tier-conversion`** — credible Free → Paid moments leveraging the
viral acquisition we've actually built.

Strongest reasons FOR:
1. **The acquisition surfaces are real but the conversion surfaces are not.**
   We have a sideline cheat sheet, a postgame text generator (pending), a
   plan-clone path (pending), and a drill-network. Coaches who arrive
   through one of these will hit the 5-call AI wall fast — and the only
   conversion moment we built (0035 quota-wall resume) is generic, not
   tied to "the artifact you were just going to send your parents." There
   is real conversion intent flowing through the product and almost no
   ticketed surface to capture it.
2. **It costs nothing on the moat side.** Tier-conversion tickets land on
   `<UpgradeGate>` + `canAccess()` (already-built primitives) and the
   `feature_*` registry (already half-built, needs a cleanup pass). This is
   the cheapest, fastest theme to ship and the one most likely to show up in
   ARR by end of next month.

Strongest reason AGAINST:
1. **Billing hardening is the bigger latent risk.** If the prod webhook is
   silently 503'ing or the `stripe_webhook_events` table isn't being
   written to, no amount of conversion improvement matters — converted
   coaches don't get their tier flipped. A single `/ideate billing-hardening`
   pass that adds a "verify webhook reachability + tier-flip integration
   test on prod" ticket would be the more responsible first move, and
   tier-conversion is wasted work on top of an unverified payment path.

If your gut says billing is fine and the recent loop hasn't surfaced
checkout complaints, take the conversion theme; the loop's whole point was
to feed the funnel and we should now close the funnel. If you have any
doubt about whether webhooks fire in prod, do billing first.

Recommended next: `/ideate tier-conversion`
