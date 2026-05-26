---
id: 0041
title: Roll up the week's parent reactions into a Monday "here's what they said" the coach actually opens
status: groomed
priority: P1
area: parent-portal
created: 2026-05-26
owner: product-groomer
---

## User story

As a volunteer coach whose parents tap a heart or leave a one-line note from the parent portal
all week long, I want a single Monday-morning email that pulls the week's reactions into one
"here's what they said" recap — counts plus the top three notes by name — so that the
appreciation parents already sent doesn't sit in a side-screen I never open, and so I start the
new week reminded that the work landed.

## Why now (four lenses)

### Product Owner
Parents have been reacting since 0022 / 0023 shipped the portal reaction surface and the
`parent_reactions` table (migration `023_parent_reactions.sql`). Today those reactions land in
an in-app inbox under `/api/parent-reactions` GET, which a coach reaches only by drilling into
the team. There is no proactive surface for them. Meanwhile the Monday-morning coaching digest
(0023) and the program pulse digest (0028) already proved coaches DO open a once-weekly email
when it pays for itself. The smallest meaningful unit of value is one more Resend cron route,
modelled byte-for-byte on `weekly-digest/route.ts`, that reuses the same `coaches.preferences`
opt-out + dedup pattern, the same `CRON_SECRET` auth, the same `sendEmail()` helper, and emits
exactly one rollup per coach per week. No new table, no new AI prompt, no model spend — every
input is structured data we already collect.

### Stakeholder
The parent-portal viral loop is one of the moats: reactions in, gratitude out, the coach is
seen and the parent stays engaged. Today the in-bound side of that loop exists; the rebound to
the coach is silent. A weekly rollup closes the loop without inventing anything — it leans on
the same Resend + dedup + opt-out plumbing 0023 / 0028 / 0036 already pay for. It also makes
the parent-portal reactions a SEEN signal that earns its own future investment (rate-limited
appreciation, parent-named thank-yous, etc.), the kind of compounding nobody who ships a forms
app gets to build because they don't have a portal with reactions in the first place. Free tier
specifically — this is retention, not a paywall, mirroring 0023 / 0036 / 0038.

### User (the coach, Monday 8:01am, phone on the kitchen counter, coffee, kid on the iPad)
They see "SportsIQ — your team's parents this week" in the inbox. They tap. Three lines: "12
parents reacted this week. Top notes: Sarah said 'thanks for sticking with Devon on his
shooting.' James said 'he came home pumped after Saturday.' Maria said 'first time he asked for
the ball at school.'" That's the whole email. They put the phone down feeling like the week was
worth showing up for. No login wall, no five-tab analytics page, no banned-words hype tone. If
the week had no reactions, they get NO email — silence beats an empty "0 reactions this week"
note that would feel like a guilt trip.

### Growth
This is a retention-by-recognition surface, not a viral one — the share path is already 0022.
But the "show me" moment is real: a coach forwards the email to a co-coach or an assistant
("look at what Sarah said this week"), and the co-coach asks "what app is this from?" The email
becomes its own warm referral artifact, the way the weekly digest already does. It also feeds
the long-half-life retention math: a coach who reads 4 weeks of "here's what your parents
said" is dramatically less likely to be the coach who quietly stops opening the app at
mid-season.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] `POST /api/cron/weekly-parent-rollup` (new) returns `200 { week, sent, skipped, errors }`
  for a valid `Bearer ${CRON_SECRET}` and `401` for any other auth, mirroring the
  `weekly-digest` cron's auth check exactly. (vitest: 401 on missing/wrong bearer; 200 + the
  result shape on valid bearer; no DB writes happen on the 401 path.)
- [ ] For a coach whose teams collected at least one `parent_reactions` row in the prior
  calendar week (Mon–Sun window — reuse `getPriorWeekMonday` / `getWeekWindow` from
  `src/lib/weekly-digest-utils.ts`), the route sends ONE email per coach with subject
  `"<FirstName>, your team's parents this week — <WeekLabel>"`. The HTML body lists the total
  reaction count and the top-3 reactions VERBATIM with parent first name only (e.g. `"Sarah:
  'thanks for sticking with Devon…'"`); reactions with no `parent_name` render as `"A
  parent: '…'"`. (vitest seeds one coach + one team + 5 `parent_reactions` rows in the prior
  week; asserts `sendEmail` called once with the subject including the coach's first name and
  the week label; asserts the rendered HTML contains all three top-note bodies and the parent
  first names.)
- [ ] A coach whose teams have ZERO reactions in the prior week is skipped entirely — NO email
  is sent (not even an empty one), `totalSkipped` increments by 1. (vitest: a coach with no
  reactions that week ends with `sendEmail` invocation count 0 for that coach and the result
  payload shows the skip.)
- [ ] Opt-out via `coaches.preferences.weekly_parent_rollup === false` skips the coach and
  increments `totalSkipped`; `true` or unset sends. The opt-out field is a NEW key on
  `preferences` (not reusing `disable_weekly_digest` — those are independent opt-outs). (vitest:
  three coaches — opt-out true, unset, explicit false-disabled — only the first two get emails;
  the third path makes no `sendEmail` call.)
- [ ] Dedup mirrors `hasAlreadySentDigest` / `markDigestSent`: after a successful send the
  coach's `preferences.parent_rollup_week_<YYYY-MM-DD>` flag is set; a second invocation of
  the same cron for the same week skips that coach. (vitest: run the cron twice in a row on
  the same fixture; first run sends, second run skips; the dedup key uses the same
  `getPriorWeekMonday(now)` string format as 0023.)
- [ ] COPPA / payload discipline: the rendered email HTML body contains NO player names from
  the team's roster — `parent_reactions` joins to `players(name, nickname)` in the GET route
  but the rollup email reads ONLY `(reaction, message, parent_name, created_at)`, NEVER the
  joined player row. (vitest: seed two reactions whose `players.name` is a distinctive token
  like `"ZZ-CHILD-MARKER"`; assert the rendered HTML string does NOT contain the token; the
  email's only quoted minor reference comes from inside the parent's own message text, which
  is freely-typed by the parent and treated as their content, not collected minor data.)
- [ ] The "top 3" selection is deterministic and test-pinned: rank by `created_at DESC` after
  filtering to messages with non-null `message` text; if fewer than 3 messages exist, render
  whatever count is available; if zero messages but ≥1 reactions, the email STILL sends with
  the count + "no notes this week" line. (vitest: 5 reactions where only 2 have messages →
  the rendered HTML lists those 2 messages and an explicit count of 5; 5 reactions with 0
  messages → email sends with count line only and no quote block.)
- [ ] Regression: a successful rollup run leaves the existing weekly-digest (0023) opt-out /
  dedup keys on `preferences` BYTE-IDENTICAL — the two emails are independent. (vitest: a
  coach already marked sent for the weekly digest stays marked; setting the rollup dedup key
  doesn't touch the digest key; running both crons back-to-back sends both emails for the
  eligible coach.)

## Out of scope

- A web inbox screen, push notifications, or in-app banner for parent reactions. v1 is the
  Monday email channel only; the existing in-app reactions surface (under
  `/api/parent-reactions` GET) is unchanged.
- AI summarization of the parent notes. v1 quotes parents VERBATIM — putting an AI rewrite
  between the parent and the coach would invert the value (the parent's own words are the
  artifact). No `callAI()` in this route.
- A parent-side digest ("here's what other parents reacted to"). The reactions are between the
  parent and the coach; a parent-to-parent surface is a separate privacy discussion.
- A tier gate. Like 0023's weekly digest is open to Coach+, this rollup is open to EVERY tier
  (free included) — it's a retention email, not paywall content. Adding a feature key would
  silently downgrade free coaches.
- A new sender, new domain, new tracker, or new analytics SDK. Reuses `sendEmail()` from
  `src/lib/email.ts` exactly as 0023 / 0028 / 0036 do; never bypasses it.
- An "unread reactions only" filter. v1 sends the top-3 by `created_at DESC` regardless of
  the `is_read` flag — coaches who never open the in-app inbox still get the rollup.
- Backfilling past weeks. The cron runs forward only; a coach who joins mid-season starts
  getting rollups the next Monday.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to
re-discover the architecture.

- `src/app/api/cron/weekly-parent-rollup/route.ts` (new) — `POST(request)`. Auth header check
  matching `src/app/api/cron/weekly-digest/route.ts` lines 49–57 (`Bearer ${CRON_SECRET}` →
  401). Compute the prior-week window with the same `getPriorWeekMonday(now)` /
  `getWeekWindow(mondayStr)` from `src/lib/weekly-digest-utils.ts`. Page coaches in batches of
  50 (reuse the same pattern). For each coach: read `coaches.preferences`, short-circuit on
  the new `parent_rollup_disabled(prefs)` and the per-week dedup; fetch `parent_reactions`
  scoped by `eq('coach_id', coach.id).gte('created_at', weekStart).lte('created_at', weekEnd)`
  selecting ONLY `(reaction, message, parent_name, created_at)` — NEVER the `players(name,
  nickname)` join the GET route uses. Build subject + HTML through new helpers (see below).
  Send via `sendEmail({ to, subject, html })`. On success, write the new dedup key back to
  `preferences` via the same `admin.from('coaches').update({ preferences: nextPrefs })`
  pattern. The route returns the same shape `{ week, sent, skipped, errors }` 0023 returns.
- `src/lib/weekly-parent-rollup-utils.ts` (new) — pure helpers analogous to
  `src/lib/weekly-digest-utils.ts`: `isParentRollupDisabled(prefs)`,
  `hasAlreadySentRollup(prefs, mondayStr)`, `markRollupSent(prefs, mondayStr)`,
  `selectTopReactions(rows, { limit: 3 })` (deterministic — created_at DESC, messages
  preferred), `buildRollupSubject(coachFirstName, weekLabel)`,
  `buildRollupHtml({ coachName, weekLabel, totalCount, topReactions, appUrl })`. The HTML
  template stays plain (no breathless tone — clipboard voice). NO `players` or `observations`
  read; this helper only takes `{ reaction, message, parent_name, created_at }`.
- `src/lib/weekly-digest-utils.ts` — leave untouched. Re-export `getPriorWeekMonday`,
  `getWeekWindow`, `formatWeekLabel` from there in the new file's imports (already exported).
- `src/lib/email.ts` — no change. Same `sendEmail({ to, subject, html })`.
- `vercel.json` — add a new cron entry pointing at `/api/cron/weekly-parent-rollup`,
  scheduled `5 8 * * 1` (Monday 08:05 UTC — five minutes after the existing
  weekly-digest at 08:00 so a coach who gets both sees the digest land first). Keep the
  existing `weekly-digest` / `parent-digest` / `practice-reminder` crons byte-identical.
- `tests/api/cron/weekly-parent-rollup.test.ts` (new, `.test.ts` NOT `.spec.ts` —
  LESSONS#0020/#38). Mock `@/lib/supabase/server` (chainable in-memory, mirror
  `tests/api/cron/weekly-digest.test.ts` if one exists or `tests/ai/weekly-star.test.ts`) and
  `@/lib/email.ts`'s `sendEmail`. Cases: 401 auth; coach with ≥1 reactions sends one email
  with subject + first-name + week label; coach with 0 reactions skipped; opt-out coach
  skipped; dedup blocks the second run; the rendered HTML omits a planted
  `"ZZ-CHILD-MARKER"` player-name; the "all reactions, no messages" path renders the count
  line and skips the quotes. Run under Node 20.19.0 by prepending the pinned bin to PATH
  (LESSONS#0010 / 2026-05-21).
- `tests/lib/weekly-parent-rollup-utils.test.ts` (new) — pure helper tests:
  `selectTopReactions` deterministic ordering across the four combinations (with/without
  messages, with/without parent_name); subject formatting; dedup-key formatting matches the
  digest pattern verbatim; the HTML builder NEVER references `player_name` or a `players` key.
- `src/lib/supabase/middleware.ts` — no change. The cron route lives under
  `/api/cron/*` which is already covered by the existing crons (`weekly-digest`,
  `parent-digest`, `practice-reminder` all reach the route without sitting in `publicPaths`
  because they're invoked server-to-server with the bearer; this one is identical).
- New deps: no. Migration: NO — `parent_reactions` already exists (migration 023). Env vars:
  no new ones; reuses `CRON_SECRET` and `NEXT_PUBLIC_APP_URL` already in `.env.example`. AI
  prompt change: NO. Tier feature key: NO (free-tier retention email).
- LESSONS to anchor: #0023 — instruct voice positively in the email body copy; never
  enumerate banned words verbatim inside the HTML template. #0084 — scan the cron's payload
  shape in the test and assert keyset on read; no joined `players` row leaks via select-star.

## Implementation log

(Appended by the implementation-dev agent during execution.)

- YYYY-MM-DD — branch `feat/0041-…` opened
- YYYY-MM-DD — failing test added in `tests/...`
- YYYY-MM-DD — PR #N opened, CI [state]
- YYYY-MM-DD — merged to main
