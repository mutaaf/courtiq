---
id: 0056
title: Let the coach send a one-line thank-you back to a parent who left a reaction, in one tap
status: groomed
priority: P2
area: parent-portal
created: 2026-05-28
owner: product-groomer
---

## User story

As a volunteer coach reading my Monday parent-reactions email (0041) and seeing that
Sarah, Devon's mom, left the note "thank you for sticking with him on his shooting," I
want one tap to send Sarah a short, specific thank-you back — written in MY voice, naming
HER kid — so that the appreciation parents already sent doesn't end with me feeling
grateful at the kitchen table; it ends with Sarah seeing that I read her note and noticed
her son specifically.

## Why now (four lenses)

### Product Owner
0022/0023 shipped the parent-reactions surface — parents leave a heart or a one-line note
from the parent portal. 0041 ships the Monday rollup to the coach. The reactions are
landing, the rollup is opening, the coach is reading what parents said. What no shipped
surface does is RECIPROCATE: today the appreciation flows one direction only — parent →
coach — and the coach has no in-product way to close the loop without manually
texting each parent (which they never do because they don't have parents' phone numbers
in their phone, only on the team roster). The smallest meaningful unit of value is one
new action button on each reaction in the rollup email AND on the in-app
`/api/parent-reactions` view: "Thank Sarah." Tap fires a one-shot AI generation that
produces a short, specific reply naming the player (Devon) and referencing the parent's
note ("shooting"), the coach previews it, taps send, and the reply lands as a new row in
`team_announcements` scoped to JUST that one parent (the existing single-recipient
send-parent-messages route handles this — already shipped for 0046's sideline cheat
sheet). One new AI prompt in `src/lib/ai/prompts.ts`, one new route that ties a
`parent_reaction.id` → an AI-drafted reply → the existing per-parent send path, one
button on the existing reaction list. No new table, no new email channel, no new tier
gate that contradicts the loop.

### Stakeholder
This is the missing FOURTH edge in the parent-portal viral graph. Today we have
(1) coach → parent: the parent report. (2) parent → coach: the reaction. (3) parent →
parent: the share-with-another-coach CTA (0011). What we have never built is (4) coach →
specific-parent: the reciprocal thank-you. It is a moat ticket because it is structurally
hard to copy — every other coaching app on the market deals in forms, where reciprocity
has nowhere to live; SportsIQ's structured reaction → AI-drafted reply → per-parent
message chain only works because the underlying data (the reaction, the player, the
coach, the parent contact) is already wired into one product. It also creates a SECOND
opening rate to optimize (parent reply opens) that compounds the original parent-report
open rate, deepening the parent-engagement signal the coach already uses. AI provider
gating goes through `callAI()` as always; quota is enforced server-side; voice is
clipboard. The risk this ticket carries is voice authenticity: a hollow AI thank-you is
worse than no thank-you. So v1 is preview-and-send (the coach reads the draft before it
goes out), one-reply-per-reaction-per-coach (no spam loops), and the prompt is anchored
in the parent's exact words plus the player's first name only — no generated
embellishment, no flattery, no banned hype words.

### User (Monday 8:01am, coach reading the parent rollup over coffee)
She taps the rollup email's "Sarah's note" line. The in-app view opens. Below Sarah's
quoted note, a button: "Thank Sarah." She taps. A small sheet slides up with a draft:
"Sarah — thanks for the note. Devon's been working hard on his shot this month and it's
landing. See you Tuesday. — Coach Maya." Two buttons: "Send" and "Edit." She skims it,
taps "Edit," changes "this month" to "since the rec center got the new hoops," taps Send.
A small toast: "Sent to Sarah." Sarah gets one text on her phone (the same channel the
existing send-parent-messages route uses) and sees that her coach read her note. The
whole thing takes 25 seconds. If the coach is on a flaky connection the AI generation
falls back to a static template ("Sarah — thanks for the note. <player> has been
working hard. — Coach"); never blocks the send. If the coach has already replied to
this reaction, the button reads "Replied" and is disabled.

### Growth
The "show me" moment is the parent. Sarah forwards her coach's reply to her partner
("look what the coach said") — and that's a viral surface SportsIQ has never owned:
parents bragging about their coach to OTHER parents in the same school district. Every
reciprocated reaction is a parent who feels seen, who keeps reacting next week, whose
share of the report (0011) carries more genuine recommendation weight because it
contains a specific story she can tell. The retention is on the COACH side too: a coach
who has reciprocated five reactions has made five parents into ambassadors, and is much
less likely to drop the app at season-end (we have no analytics SDK to measure this —
the hypothesis stands as a hypothesis, not a number). Distinct from every shipped
surface: 0011 is parent → other-parent; 0019 is parent → "I'll also coach"; 0046 is
coach-side sideline cheat sheet (one-way, in the dashboard); THIS is coach → specific-
named-parent, the one channel that creates a personal correspondence between the two
without forcing the coach to leave the product.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] A new column on `parent_reactions`: `coach_reply_at TIMESTAMPTZ NULL` and
  `coach_reply_id UUID NULL REFERENCES team_announcements(id) ON DELETE SET NULL`
  in a new migration `051_parent_reactions_coach_reply.sql`. The column carries NO new
  minor data — it stamps when the coach replied and which announcement was the reply.
  Pick the next free prefix after 050 (0054's `050_coaches_handle.sql`); LESSONS#0006.
  COPPA discussion: the new columns are on a table that JOINS to `players` via
  `parent_reactions.player_id` (existing). The new columns add NO new minor descriptive
  field — they are timestamps and FKs only. Document this in the migration's `--`
  header comment as the COPPA approval trail (LESSONS#0088 — strip comments before
  scanning tests). (vitest scans the migration's executable DDL — strip `--` comments —
  and asserts only the documented columns are added; banned tokens `name`, `similarity`,
  `dob`, `biometric`, `photo`, `medical` are absent.)
- [ ] A new AI prompt `parentReactionReply` in `src/lib/ai/prompts.ts` returning
  `{ system, user }`. The system tells the model: "You write a short reply from a youth-
  sports coach back to a parent who left a positive reaction. 2 sentences max, plain
  English, name the player by first name, reference the parent's note in your OWN
  words (no quoting), no marketing voice, no exclamation marks unless the parent used
  one. End with the coach's first name." The user prompt is the structured input:
  `{ playerFirstName, parentFirstName, reactionNote, coachFirstName }`. Per LESSONS#0023
  the system prompt instructs the voice POSITIVELY ("write like a coach's clipboard");
  never enumerates the banned tokens verbatim. (vitest contract test scans
  `${system}\n${user}` for AGENTS.md banned tokens and asserts none appear; runs the
  prompt under Anthropic and one fallback provider per AGENTS.md test rule.)
- [ ] `POST /api/parent-reactions/[reactionId]/draft-reply` (new) generates the AI
  draft. Auth → 401. Resolves the reaction; if `reaction.coach_id != caller.id` → 404
  (no cross-coach reply). If `reaction.coach_reply_at IS NOT NULL` → 409
  `{ error: 'already_replied' }`. Calls `callAI()` with the new prompt and a quota-
  enforced provider routing; returns `{ draft: string }`. The draft contains ONLY first
  names (player + parent + coach) — never a full name, email, or DOB. (vitest: 401
  missing auth; 404 wrong-coach; 409 already-replied; happy path calls `callAI` once
  with the right prompt id; the draft response keyset is exactly `{ draft }`.)
- [ ] `POST /api/parent-reactions/[reactionId]/send-reply` (new) sends the final reply.
  Auth → 401. Accepts `{ message: string }` (the coach's edited / approved text — server
  re-validates length < 500 chars and strips any planted email / phone / URL). Resolves
  the reaction; if `reaction.coach_id != caller.id` → 404. If
  `reaction.coach_reply_at IS NOT NULL` → 409. Calls the existing
  `/api/send-parent-messages` per-parent path (the route shipped by 0046 — verify with
  `ls src/app/api/send-parent-messages/`) with a single recipient resolved via
  `players.parent_contact` from `reaction.player_id` (NEVER a free-typed contact). On
  success, atomically stamps `parent_reactions.coach_reply_at = now()` and
  `coach_reply_id = <new announcement id>`. Idempotent: re-POST returns 409 with the
  same `coach_reply_id`. (vitest: 401 missing auth; 404 wrong-coach; 409 already-replied;
  happy path stamps the row + creates the announcement; URL/phone/email in the message
  body are stripped; re-POST returns 409 with the stable id.)
- [ ] The existing parent-reactions inbox view (`/api/parent-reactions` consumer in the
  dashboard — read first to find which page renders it) renders a new "Thank <parent
  first name>" button on each unreplied reaction. The button opens a sheet that POSTs
  the draft route, shows the draft + Edit/Send buttons, and on Send POSTs the send
  route. On success the row's button collapses to a small "Replied" pill and the row's
  `coach_reply_at` shows under it. (Playwright/component: render with a seeded reaction
  → assert the button renders; tap → assert the sheet opens with the draft text; tap
  Send → assert the row shows "Replied"; render with a pre-replied reaction → assert
  the button is gone and "Replied" pill is shown.)
- [ ] The 0041 Monday parent-rollup EMAIL (existing — read first) gains a deep-link on
  each highlighted reaction: tapping "Thank Sarah" in the email opens the in-app
  reaction view scrolled to that reaction's row with the Thank-Sarah sheet pre-opened
  (an `?openReply=<reaction_id>` URL param on the inbox page). The email body itself
  does NOT contain the draft (no AI is run on cron — only when the coach taps); v1 is
  in-app-only for the actual draft+send, the email is the entry point. (vitest:
  `buildParentReactionRollupEmail` (or the existing email helper) renders one link per
  highlighted reaction with the `?openReply=<id>` param; the inbox page reads the
  param and opens the sheet on first render.)
- [ ] AI quota / provider failover: `callAI()` is the only AI entrypoint (AGENTS.md
  rule 4). The draft route logs to `ai_interactions` like every other AI route. A
  coach over their tier's AI quota gets a `<UpgradeGate feature="ai_reply_draft" />`
  surface on the button — but the SEND route (which uses NO AI) is always available
  with a static template fallback: "Sarah — thanks for the note. Devon has been
  working hard. — Coach Maya." So a quota-blocked coach can still reply, just from a
  template instead of an AI draft. (vitest: a coach at quota receives the static
  template from the draft route — NOT a 402 — and the template substitutes the right
  first names. Quota enforcement runs server-side via `canAccess` per LESSONS#0023.)
- [ ] Privacy / COPPA: the AI prompt receives ONLY first names of the three actors
  (player, parent, coach) and the parent's note text. NO email, NO phone, NO DOB, NO
  observations are passed to the model. The reply is delivered via the EXISTING
  send-parent-messages per-parent route (0046's contract) which already enforces "the
  recipient is the player's parent_contact, not free-typed." The `coach_reply_id`
  FK points at `team_announcements` (existing) which already has its own RLS posture.
  (vitest: assert the `callAI` prompt payload contains only the documented first names
  + the reactionNote; planted email/phone/DOB tokens in the seeded reaction do NOT
  appear in the prompt; the send-route NEVER accepts a free-typed recipient — it
  resolves from `players.parent_contact`.)
- [ ] Voice contract: the AI prompt's system+user strings contain NO AGENTS.md banned
  word in the INSTRUCTION (LESSONS#0023 — instruct positively). The static template
  fallback string contains no banned words. Every new user-facing string ("Thank
  <parent>", the sheet header, the "Replied" pill, the email link copy) contains no
  banned words. (vitest: scan the prompt strings + the fallback template + every new
  component's rendered text.)
- [ ] Rate-limit / abuse posture: at most ONE reply per `(coach_id, reaction_id)` —
  enforced by the `coach_reply_at` NOT-NULL check. At most N=20 reply-sends per coach
  per day (per LESSONS — the existing send-parent-messages route already has a per-
  coach daily cap; reuse it). The draft route is rate-limited by the existing AI
  quota enforcement (no new limiter). (vitest: 21st same-day send returns 429; second
  reply to the same reaction returns 409.)
- [ ] Tier / feature gating: ONE new tier feature key `feature_ai_reply_draft` registered
  in `src/lib/tier.ts` and `FEATURE_CONFIG` in `<UpgradeGate>` (per LESSONS#0023 — the
  prop value must exactly match the tier key). Free coaches get the static-template
  fallback path on the draft route, paid coaches (`coach` and up) get the AI-generated
  draft. The Send path is universal (free coaches can still thank parents with the
  static template — gating SEND would invert the loop). Server-side `canAccess(tier,
  'feature_ai_reply_draft')` enforces. (vitest: a free coach's draft route returns the
  static template; a `coach`-tier coach's draft returns the AI draft; the Send route is
  always 200 regardless of tier.)
- [ ] Regression: the existing `/api/parent-reactions` GET response shape is byte-
  identical to today. The existing 0041 Monday rollup email is byte-identical for any
  reaction that has not been replied to (the `?openReply` deep-link is purely additive).
  The existing 0046 sideline-cheat-sheet flow is untouched. The existing send-parent-
  messages route is called with the SAME contract it has today. (vitest: snapshot the
  existing `/api/parent-reactions` response; assert byte-equality. Snapshot the
  existing 0041 email HTML for an unreplied reaction; assert no change beyond the
  added link.)

## Out of scope

- A multi-recipient reply ("thank all 5 parents who reacted this week"). v1 is per-
  reaction, per-parent. Bulk replies invite hollow voice and reciprocity-spam dynamics.
- A back-and-forth thread (parent replies to the thank-you, coach replies again, ...).
  v1 is one-shot. Threading is a separate ticket and a different inbox model.
- An auto-reply / "send thank-yous on a schedule." v1 requires the coach to tap. Auto-
  thanks would destroy the voice authenticity moat this ticket relies on.
- A parent-side UI to opt out of replies. v1 trusts the existing send-parent-messages
  posture (the parent already consented to receive coach announcements when they
  joined the portal). A separate "no replies please" preference is a future ticket.
- Storing the AI draft. v1 either sends the coach-edited final or sends nothing — the
  draft is ephemeral. No `parent_reaction_drafts` table.
- Customizing the prompt per coach ("I'm a more formal coach"). v1 is one prompt; per-
  coach voice is a future ticket (potentially connected to 0037's coaching-signature
  memory).
- Localizing the reply to non-English parents. v1 is English.
- A separate email channel from SportsIQ to the parent. v1 uses the existing per-parent
  send-parent-messages route (the same channel parents already receive announcements
  on); no new sender / domain / authentication.
- Threading the reply into the weekly parent rollup (0041). v1 only links FROM the
  rollup TO the in-app reply sheet; future ticket can show "you replied to 3 of 12
  reactions this week" in the next rollup.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to
re-discover the architecture.

- New migration `supabase/migrations/051_parent_reactions_coach_reply.sql` — adds
  `coach_reply_at TIMESTAMPTZ NULL` and `coach_reply_id UUID NULL REFERENCES
  team_announcements(id) ON DELETE SET NULL` on `parent_reactions`. Document the COPPA
  approval trail in the `--` header comment per LESSONS#0088 (so the migration test
  strips comments before scanning DDL). Pick `051_…` after `050_coaches_handle.sql`
  from 0054 — coordinate the prefix at pickup time per LESSONS#0006/#0009. The
  migration adds NOTHING to `players` directly.
- `src/types/database.ts` — extend the `ParentReaction` row type with `coach_reply_at:
  string | null` and `coach_reply_id: string | null`. Per LESSONS#0099, after widening
  the type grep `tests/` for `ParentReaction` literals and add the new fields with
  `null` defaults to every constructor.
- `src/lib/ai/prompts.ts` (existing — append) — new export `parentReactionReply({
  playerFirstName, parentFirstName, reactionNote, coachFirstName }): { system, user }`.
  Voice POSITIVELY per LESSONS#0023.
- `src/app/api/parent-reactions/[reactionId]/draft-reply/route.ts` (new) —
  `POST(request, { params })`. Auth → 401. Resolve the reaction; cross-coach 404;
  already-replied 409. Call `callAI()` via the new prompt with `{ orgId }` so quota +
  provider routing work (AGENTS.md). Return `{ draft }`. On quota-block, fall back to
  the static template (NOT a 402 — the coach must always be able to reply).
- `src/app/api/parent-reactions/[reactionId]/send-reply/route.ts` (new) —
  `POST(request, { params })`. Auth → 401. Re-validate the message length + strip
  planted email/phone/URL. Call the existing `/api/send-parent-messages` path
  internally (or invoke the helper it uses; do NOT re-implement the send pipeline).
  Atomically stamp `parent_reactions.coach_reply_at` + `coach_reply_id`. Same
  posture as LESSONS#0039 — never trust client-supplied recipient; resolve from
  `players.parent_contact`.
- `src/lib/parent-reply-utils.ts` (new) — pure helpers: `buildStaticReplyTemplate({
  parentFirstName, playerFirstName, coachFirstName })` (the fallback string),
  `stripContactInfo(message: string): string` (regex out `mailto:`, `https?://`,
  digit-runs over 6 → masked). NO database access; NO AI call.
- `src/components/parent-reactions/thank-parent-sheet.tsx` (new) — client component.
  Uses `query()` to POST the draft route on open (LESSONS — the component should
  POST on open, not on mount-then-effect, to avoid an effect that runs on every
  re-render). Renders draft + Edit/Send. Uses `mutate()` to POST send-reply.
  Dark/zinc/orange aesthetic, 44px targets.
- `src/components/parent-reactions/reactions-inbox.tsx` (existing — read first; find
  via `grep -rn "parent-reactions" src/components/`) — render the new "Thank <parent>"
  button on each unreplied reaction. Read `?openReply=<reaction_id>` from the URL
  search params on mount and auto-open the sheet for that reaction.
- `src/lib/email/weekly-parent-rollup.ts` (existing — shipped by 0041) — extend the
  per-reaction template to include an `?openReply=<id>` query param on the inbox link.
- `src/lib/tier.ts` — register `feature_ai_reply_draft` in `coach`, `pro_coach`,
  `organization` tier `features` arrays (free does NOT get it; free gets the static
  template fallback). Per LESSONS#0023 the `<UpgradeGate>` prop value must equal the
  tier-key exactly.
- `src/components/ui/upgrade-gate.tsx` (existing) — register the new feature key in
  `FEATURE_CONFIG` with the benefit copy.
- `src/lib/supabase/middleware.ts` — NO change. The new routes are dashboard-only /
  authed.
- `tests/ai/parent-reaction-reply.test.ts` (new) — AI contract test under Anthropic +
  one fallback provider per AGENTS.md test rule. Asserts the rendered prompt has the
  right first names and reactionNote; asserts no banned tokens in `${system}\n${user}`.
- `tests/api/parent-reaction-draft-reply.test.ts` (new) — 401, 404, 409, happy path,
  quota-fallback-to-template. Run `tsc --noEmit` without piping (LESSONS#0095/#0096).
  Run under Node 20.19.0 (LESSONS#0010). Mock `callAI()` to a deterministic response.
- `tests/api/parent-reaction-send-reply.test.ts` (new) — 401, 404, 409, happy path
  stamps the row + writes the announcement; planted contact-info in the message body
  is stripped; re-POST returns 409 with stable id; 21st same-day send returns 429.
- `tests/lib/parent-reply-utils.test.ts` (new) — `buildStaticReplyTemplate` for each
  first-name case; `stripContactInfo` strips emails / URLs / 7+ digit runs.
- `tests/components/thank-parent-sheet.test.tsx` (new) — render with mocked draft →
  asserts the draft text renders; Send taps the send route; on success the sheet
  closes.
- `tests/migrations/parent-reactions-coach-reply.test.ts` (new) — strip `--` comments
  per LESSONS#0088; assert the two new columns; assert no banned-token; assert NO new
  column on `players`. COPPA approval trail in the migration's `--` header.
- `tests/e2e/thank-parent-flow.spec.ts` (new Playwright spec) against the 0006-seeded
  Supabase. Seed: extend `tests/e2e/fixtures/seed.sql` to add one `parent_reactions`
  row tied to the existing E2E coach + an existing seeded player with a
  `parent_contact`. Per LESSONS#0084 — make sure the player + parent contact exist.
  Per LESSONS#0101 — pick a non-colliding UUID. Spec: sign in as the E2E coach,
  navigate to the parent-reactions inbox, tap "Thank <parent>", assert the sheet
  opens with a draft, tap Send, assert the row shows "Replied" via a stable
  `data-testid` (LESSONS#0081). Skip when E2E creds are unset.
- New deps: NO. Migration: YES — two nullable columns on `parent_reactions` (NO
  new column on `players`). Env vars: NO. AI prompt change: YES, new
  `parentReactionReply` in `src/lib/ai/prompts.ts`. Tier feature key: YES,
  `feature_ai_reply_draft`.
- LESSONS to anchor: #0006/#0009 (migration prefix uniqueness; coordinate after
  050). #0023 (instruct prompt positively; `<UpgradeGate feature=...>` prop must
  equal tier-key exactly). #0039 (never trust client-supplied recipient; resolve
  from server-side join). #0078 (response keyset deep-equality). #0081 (data-testid
  scoping). #0084 (seed players + parent_contacts when adding e2e reaction rows).
  #0088 (strip `--` comments before scanning migration DDL — the COPPA approval
  trail lives in the comment header). #0092/#0100 (the new draft+send routes share
  no `from()` chains with existing routes — no mock-queue spillover expected, but
  if extending `parent-reactions` route in any way, drain `mockReturnValueOnce`
  queues in `beforeEach`). #0099 (after widening `ParentReaction` type, grep tests
  for literal constructors and add the new fields). #0101 (pick new seed-row
  UUIDs in a non-colliding range — the parent_reactions table is already used by
  0023 + 0041 seeds).

## Implementation log

(Appended by the implementation-dev agent during execution.)

- YYYY-MM-DD — branch `feat/0056-...` opened
- YYYY-MM-DD — failing test added in `tests/...`
- YYYY-MM-DD — PR #N opened, CI [state]
- YYYY-MM-DD — merged to main
