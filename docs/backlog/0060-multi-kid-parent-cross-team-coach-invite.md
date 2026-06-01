---
id: 0060
title: When a parent reads two of their kids' reports on SportsIQ, give them one tap to bring the OTHER kid's coach onto the app with their kid's name attached
status: in-progress
priority: P1
area: growth
created: 2026-06-01
owner: product-groomer
---

## User story

As a parent who has two kids in youth sports — one on a SportsIQ team, one on a team whose
coach still texts a wall of group-chat updates and a Google Drive folder of practice plans —
I want a one-tap "invite my other kid's coach" surface on the parent portal of the kid
already on SportsIQ, pre-filled with my other kid's first name ("hey Coach — Liam's mom
here, my kid Sofia is on your team, this is what I'm getting for him, would love this for
her"), so that I can pull the OTHER coach onto the product from the same parking lot where
I just read Liam's report, without typing a single thing.

## Why now (four lenses)

### Product Owner
The product has shipped every direction of viral except this one. Coach → parent (the
parent report and reactions). Coach → coach (assistant invite 0015, observer-to-coach
0029, practice-plan clone 0049, league plan discovery 0055). Parent → program director
(0050). Parent → coach as a SELF-signup (0019, the parent-who-also-coaches path). What
the product has NEVER shipped is the PARENT-TO-OTHER-COACH path — the second-most
common shape of the "this app is good, you should be on it" sentence a youth-sports
parent says out loud in their life: "my OTHER kid's coach should use this." A
multi-kid family is the modal shape of the audience (NCAA reports ~55% of youth-sports
families have 2+ kids playing). Today every multi-kid family sits in front of a strict
asymmetry: kid A's coach sends them a beautiful SportsIQ report, kid B's coach sends
them a group text. The smallest meaningful unit of value is one surface on the parent
portal: when the parent's email shows up on `parent_shares` rows tied to TWO different
teams (or, equivalently, when the SAME parent_email is observed on a second team's
roster after they read kid A's report), show ONE card on kid A's report — "Bring
Sofia's coach onto SportsIQ" — with a pre-filled invite email naming kid B's first name
and a referral code carrying the inviting PROGRAM (not the parent's identity) so the
loop attributes correctly. No new tier gate on the action (the loop must stay open),
no new data widening on the player, no new email collection.

### Stakeholder
This is the highest-CAC-leverage acquisition surface left on the table. Every existing
acquisition channel converts at the "cold parent reads ONE report and the coach is good"
moment; this channel converts at the "the parent has ALREADY lived the value TWICE" moment
— they have two reports to compare, they have already typed their kid's name into the
product, they have already opened the report at 9:14pm. Revealed preference is doubly
strong. Three moat deepenings, all structurally invisible to a forms-app competitor.
(1) The cross-roster identity moat — the parent-email is the load-bearing edge type
the product has under-used: it already exists on `players.parent_email` and on
`parent_shares` for the joinable-on-email rollup, and it never crosses a child's identity
in the process (the matched parent-email is COACH-AUTHORED, not minor-derived). (2)
The cross-program acquisition moat — every parent who invites coach B is a parent who
expanded the product's reach from program A to a NEW program; over time this is the
fastest way the loop crosses program boundaries. (3) The retention compounding — a parent
whose BOTH kids' coaches are on SportsIQ is a parent who opens the parent portal twice
as often, AND that parent's second coach's onboarding signal carries a real referral
from a real parent — the highest-conversion signup signal we ship.

### User (the parent, Wednesday 9:14pm, kid A's room, just read the report)
She finishes reading Liam's parent report on `/share/<token>` — the report she gets
every Sunday after his practice. At the bottom of the report, a small card under the
existing "Share with your other coach" CTA she's already seen: "Liam is on the Hawks
(SportsIQ). Sofia is on the Hornets (not yet). Bring Sofia's coach onto SportsIQ?" Below
that, a single button — "Invite Coach <Sofia's coach's name> with one tap." She taps.
A short sheet shows the pre-filled email she's about to send (the coach's name from her
kid B's roster row if it's there, otherwise a generic "Coach"; her kid B's first name
inline in the subject), the referral code is attached to the program her family is in,
and she can edit the one-line note if she wants. Tap "Send." Done in 14 seconds, on the
couch, kid B already asleep. If she has NO second kid's parent-email match (the modal
case: she only has one kid in youth sports), the card never renders — silence beats a
generic "invite anyone" CTA every time. If kid B's coach is ALREADY on SportsIQ (the
parent_email matches another `coaches.email` row in our DB or another `parent_shares` row
in an active state on a SportsIQ team), the card flips to "Your other coach is already
on SportsIQ — connect Sofia's report to your account?" — the existing parent-self-signup
0019 surface picks up from there, NEVER an invite email.

### Growth
The "show me" moment is the SHEET — the parent looking at the pre-filled email naming
HER kid's first name and HER other coach's first name. That is the screenshot a parent
forwards to her sister who has three kids in three sports — the cleanest possible demo
of "this app finds your life and acts on it." Compounds three ways. (1) Every invite a
parent sends is a far higher-conversion lead than a cold coach landing page (revealed
preference + named referrer + named program). (2) The parent's second invite (her
neighbor) gets a downstream-flavored card too — the loop is self-priming. (3) The
parent's report itself becomes the place the second coach lands FIRST when they
follow up — they see the report Liam's coach generated, not a marketing landing page,
which is the only acquisition demo that holds up after one read. Distinct from every
shipped surface: 0011 / 0021 turn the COACH into the inviter; 0019 turns the parent
into a self-signup; 0050 turns the parent into a forwarder to the program director;
THIS turns the parent into the FIELD MARKETER, in the exact same surface they already
trust.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] `GET /api/share/[token]/sibling-invite-candidate` (new, public — token-scoped) returns
  `200 { candidate: { otherTeamName, otherCoachName, otherCoachEmail, siblingFirstName, programId } | null }` for the parent reading `share[token]`. The route resolves the parent's
  `parent_email` from the `players` row behind that token, then does ONE service-role
  lookup: any OTHER active `players` row whose `parent_email` matches case-insensitively
  AND whose `team_id` is on a DIFFERENT team than the current share's team AND whose team
  is NOT already on SportsIQ as an active team (i.e. the matched row's `team_id` does not
  belong to a team with a current head coach — we are looking for the case where the
  parent has added a SECOND child to a non-SportsIQ team via... wait — the players table
  is per-team and only filled by SportsIQ coaches. Re-scope: the match is the inverse —
  a SECOND `parent_shares` row for the SAME `parent_email` (or for the same parent_email
  on a different `players` row) on a DIFFERENT team. If the match exists on a SportsIQ
  team where the OTHER coach IS already on SportsIQ, the route returns `{ candidate: null }`
  and a separate flag `alreadyOnSportsIQ: true` so the UI can pivot to the existing 0019
  parent-self-signup surface. Returns `{ candidate: null }` for a parent with no second
  match. (vitest: parent with no second kid → null; parent with a second kid on a
  not-yet-SportsIQ team → candidate populated; parent whose second coach IS already on
  SportsIQ → `{ candidate: null, alreadyOnSportsIQ: true }`; tampered or unknown token →
  404, not 500.)
- [ ] `POST /api/share/[token]/sibling-invite` (new, public — token-scoped) accepts
  `{ siblingFirstName: string, otherCoachEmail: string, note?: string }` (max 200 chars
  on `note`), verifies the token, generates a referral code per the existing 0021
  `makeReferralCode(programId)` (NOT `coach.id` — the program owns the referral, not the
  parent; the parent never receives a referral credit), sends ONE email to
  `otherCoachEmail` with the subject `"<Parent first name> invited you to try SportsIQ
  for <siblingFirstName>'s team"`, body short (5 elements only — see below). On send,
  writes ONE row to a new `parent_initiated_invites` table (`id`, `from_share_token`,
  `from_player_id`, `to_coach_email`, `sibling_first_name`, `program_id`, `sent_at`,
  `referral_code`) to dedupe; if the same `(from_share_token, to_coach_email)` already
  has a row in the last 30 days, the route returns 200 with `{ sent: false,
  reason: 'already-invited' }` and DOES NOT send a second email. (vitest: 200 success
  path writes the row + sends the email; 200 dedup path sends no second email; 400 on
  missing fields; 400 on `note` > 200 chars; 404 on tampered token; 200 with
  `alreadyOnSportsIQ: true` skip if the candidate route would now return that flag.)
- [ ] A new migration `056_parent_initiated_invites.sql` adds the dedupe table above —
  the COLUMNS allow-listed in the acceptance criteria, NO additional fields, NO
  child-derived columns beyond `sibling_first_name` (which is parent-typed in the
  invite sheet, NOT lifted from the seeded `players` row). The migration mirrors
  `048_practice_plan_shares.sql` byte-for-byte where applicable (header comment,
  index style). Prefix `056` is the next free integer after `055_player_handoffs.sql`
  (LESSONS#0006 — coordinate prefix uniqueness; balance INSERT column/value counts on
  any seed data; verify at pickup time). Per LESSONS#0088 strip `--` comments before
  running the no-banned-token vitest scan on the migration body. (vitest scans the
  migration SQL stripped of `--` comments, asserts only the documented columns are
  added; the `sibling_first_name` column is text, nullable, no NOT NULL constraint;
  no `date_of_birth`, no `parent_email`, no `parent_phone` on this table.)
- [ ] Parent-portal UI: on `/share/[token]`, AFTER the existing "Share with your other
  coach" CTA card (the 0011 surface), the new `<SiblingInviteCard candidate={...} />`
  renders if `/api/share/[token]/sibling-invite-candidate` returns a non-null candidate.
  Tapping the card opens a sheet pre-filled with the candidate's coach name + the
  sibling's first name + the program-level referral code; the parent can edit `note`
  (max 200 chars) and tap "Send invite." On success, the card flips to a thank-you
  state: "Invite sent to <coach first name>. Sofia's coach will get one email." If
  `alreadyOnSportsIQ: true`, the card surfaces the existing 0019 "Start your own
  account / connect Sofia's report" copy and link INSTEAD (zero new state). Component
  exposes `data-share-url={inviteUrl}` and a `data-testid="sibling-invite-card"` per
  LESSONS#0056/#0082. (vitest component test: card renders for non-null candidate;
  card renders 0019 copy for alreadyOnSportsIQ; sheet pre-fills with candidate data;
  Send button POSTs to the new route with the form payload; success state flips
  in-place.)
- [ ] The invite email body has FIVE elements ONLY (no marketing hero, no
  testimonials, no "why SportsIQ"): a parent-voiced 1-2 sentence header ("<Parent first
  name> is using SportsIQ for <sibling's team> — they wanted to make sure you saw it"),
  a short paragraph of the parent's optional note (skipped if empty), ONE CTA button
  "See how it works" deep-linking to `/?ref=<referralCode>&program=<programId>` (the
  existing 0021 referral landing path; the link carries the program — NEVER the
  parent's email or the kid's name in the URL), a small fineprint line "<Parent first
  name> shared this from <Program Name>'s SportsIQ portal — they did NOT share your
  email beyond this invite," and the existing unsubscribe link from
  `src/lib/email/layout.ts`. Voice contract: NO AGENTS.md banned word in the subject
  OR body per LESSONS#0023 (instruct positively in the prompt — there is no AI here;
  this is a template, but the same lint applies). (vitest: `buildSiblingInviteEmail`
  output for fixture inputs; subject naming pattern asserted; banned-word scan on
  every output; no template variable leaks the parent's email into the body's
  visible text — only the From address carries it.)
- [ ] Server-side tier-gate check: this surface is NOT tier-gated for the parent — a
  parent reading any SportsIQ team's share token (free coach, paid coach, org coach)
  sees the card. The inviting coach's tier never matters; the loop must stay open. But
  the new dedupe table and the new route MUST go through `createServiceSupabase()` and
  MUST self-enforce a rate limit (`max 3 invites per from_share_token per 7 rolling
  days`) to prevent abuse from a leaked token. (vitest: a fourth invite from the same
  token in 7 days returns 429 with `{ reason: 'rate-limited' }`; a coach-tier
  publisher's token sees the same surface as a free-tier publisher's token; no
  `canAccess()` call in either route — assert the route does NOT import `tier.ts`.)
- [ ] Privacy / COPPA contract: the sibling's first name in the email body is the
  string the PARENT typed in the sheet (parent-authored), NOT a server-side lookup
  from a `players` row on the second team. The candidate-lookup route returns the
  sibling's first name from the SAME parent's row on the second team ONLY to pre-fill
  the sheet; the parent can edit it before sending. The candidate-lookup NEVER returns
  the sibling's last name, DOB, or any other player field; assert the route's
  `.select()` is exactly `'id, name, team_id, parent_email'` and the response strips
  to `siblingFirstName = name.split(' ')[0]`. The dedupe table NEVER stores the
  sibling's full name, NEVER stores `parent_email`, NEVER stores `parent_phone`. The
  invite email's From address is the existing `noreply@youthsportsiq.com`, never the
  parent's real email. (vitest: planted `players.date_of_birth` / `medical_notes` /
  `parent_phone` rows on the candidate's team do NOT appear in the candidate response
  or the email; the candidate response's keyset is asserted against the documented
  allow-list; a malformed payload trying to inject a sibling last name into the
  email body is rejected.)
- [ ] Regression: the existing 0011 "Share with your other coach" CTA on the parent
  portal renders byte-identically. The existing 0019 "Start your own account" CTA on
  the reaction success screen (0022) renders byte-identically. The existing
  `/api/share/[token]` GET response shape is byte-identical (new fields are added on
  the new sibling-invite-candidate route, not on the share route). (vitest: snapshot
  the 0011 + 0019 + share-route responses against the seeded fixture pre- and post-
  change; assert no diff in any field name or value beyond what this ticket adds.)
- [ ] Voice contract: every user-facing string the dev adds (the card title, the
  sheet field labels, the Send button, the success state, the email subject +
  body + fineprint) contains NO AGENTS.md banned word ("journey", "amazing",
  "exciting", "elevate", "empower", "synergy", "unlock"). Per LESSONS#0023 instruct
  positively; never enumerate the banned tokens in the template strings. (vitest:
  scan `buildSiblingInviteEmail` output + the new component's rendered text + the
  new sheet's rendered text for the banned list.)
- [ ] Seeded e2e on the 0006 fixture: seed extension is ONE additional players row
  on a SECOND team in the SAME program with the SAME `parent_email` as the existing
  E2E player's parent, plus the SECOND team owned by a coach whose email is NOT in
  SportsIQ's `coaches.email` set (the OTHER coach, the invite target). Per
  LESSONS#0084 — confirm any new `auth.users` row is seeded with the same fixed UUID
  block BEFORE the new `coaches` row; per LESSONS#0085 — wrap jsonb literals
  correctly if any are added; per LESSONS#0101 — pick a free UUID range (e.g.
  `0000000000c0+`) to avoid colliding with shipped seed ids. Playwright spec:
  navigate as the seeded parent to `/share/<token>`, assert the sibling-invite card
  renders, open the sheet, assert pre-fill, tap Send, intercept `sendEmail` and
  assert the invite was queued with the expected payload, assert the success state
  renders. Scope assertions with `data-testid` per LESSONS#0081 / #0082. Skip when
  E2E creds are unset. The 0029 / 0082-style strict-mode collision (the parent's
  name appearing in the team name) must be anticipated — scope to the new
  `data-testid="sibling-invite-card"` container, never a page-wide getByText.

## Out of scope

- Auto-sending the invite email without the parent's tap. v1 requires the parent to
  open the sheet and tap Send. An auto-send would destroy trust and burn the
  sending-domain reputation 0042 just protected.
- SMS to the other coach. v1 is email-only. SMS would need its own AGENTS.md approval
  line.
- Cross-program AI-generated coach-name lookup (e.g. scraping the other team's
  league website to fill in the coach's name). v1 reads ONLY the sibling's
  `players.parent_email` match on a SportsIQ-seeded second team where the OTHER coach
  is the one we're inviting; if that second team isn't on SportsIQ at all, this
  surface doesn't exist (the parent already has the 0050 "tell your director" path
  for that case).
- Multi-invite picker. v1 invites ONE other coach per tap. If the parent has 3 kids,
  they can open the card 3 times across 3 different reports; the dedupe is per
  `(from_share_token, to_coach_email)`.
- A separate sender domain for the invite email. v1 uses the existing `sendEmail` +
  layout.
- Coach-facing analytics on parent-driven invites. v1 is a single-shot send + a
  dedupe row; an aggregated "your parents brought in 4 coaches this month" surface
  is a follow-up moat ticket on top of this one.
- A "claim your kid's report" path for the invited coach. v1's invited coach lands
  on the standard signup; their FIRST team uses the SAME program_id + age_group
  as the inviting parent's team (set automatically from the referral code's
  attached program), but their team is created fresh, never auto-stitched to the
  invited kid's roster. COPPA: a coach who has not yet signed up has NO authority
  over a minor's record.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't redesign
on pickup.

- `supabase/migrations/056_parent_initiated_invites.sql` (new) — the dedupe table. NO
  child-derived columns beyond parent-typed `sibling_first_name`. Mirror
  `048_practice_plan_shares.sql` byte-for-byte where applicable (header comment, index
  style). LESSONS#0006 — confirm prefix `056` is still the next free integer at
  pickup time (a parallel ticket may have claimed it; if so, bump). LESSONS#0088 —
  the no-banned-token scan must strip `--` comments first.
- `src/types/database.ts` — add the new table type. Per LESSONS#0099 / #0103 — make any
  new field on the existing `Player` / `ParentShare` type OPTIONAL where it widens
  shared helpers; the new table itself is wholly additive and won't cascade.
- `src/app/api/share/[token]/sibling-invite-candidate/route.ts` (new) — `GET`. Public
  (token-scoped). Uses `createServiceSupabase()`. Returns 200 with `{ candidate, alreadyOnSportsIQ }`. Per LESSONS#0009 — this is a route, not a server component, so a
  Playwright `request.get` can hit it directly. Per LESSONS#0057 — for any team-
  ownership lookup, go through `team_coaches`, NOT `teams.coach_id` (no such column).
- `src/app/api/share/[token]/sibling-invite/route.ts` (new) — `POST`. Public (token-
  scoped). Rate-limit `max 3 invites per from_share_token per 7 rolling days` enforced
  via the new dedupe table. Calls `sendEmail` with the new template. Per LESSONS#0033
  — when generating commit messages with backticks/parens/em-dashes through the agent
  shell, write the body to a temp file and `git commit -F /tmp/msg.txt`.
- `src/lib/sibling-invite-utils.ts` (new) — pure helpers: `buildSiblingInviteEmail(args)`
  returning `{ subject, html, text }`; `firstNameOnly(fullName: string)` for the
  candidate response. No DB access. Banned-word scan target.
- `src/components/parent/sibling-invite-card.tsx` (new) — the card + the sheet. Uses
  the parent portal's gray/orange aesthetic (NOT dark dashboard). Exposes
  `data-share-url={inviteUrl}` and `data-testid="sibling-invite-card"` per
  LESSONS#0056 / #0082. Mirrors the existing 0011 "Share with your other coach" card
  in `src/components/parent/<existing>.tsx` for visual consistency.
- `src/app/share/[token]/page.tsx` (existing — read first) — mount the new card
  AFTER the existing 0011 card. Per LESSONS#0009 — this is a server component, so
  the candidate-lookup happens server-side in `getShareData()` (extended) and is
  passed as a prop, OR fetched client-side via TanStack `useQuery` from a
  client-component sub-tree (preferred — the share page already mixes both;
  the e2e is straightforward either way per LESSONS#0036's rule of thumb).
- `src/lib/email/templates.ts` (existing) — add `siblingInviteEmail(args)` after the
  existing templates. Reuse `renderEmail` + `ctaButton` + `paragraph` + `fineprint`
  from `src/lib/email/layout.ts`. Voice contract per LESSONS#0023.
- `src/lib/supabase/middleware.ts` — NO change. The new routes live under
  `/api/share/[token]/...` which is already covered by the existing `publicPaths`
  allow-list entry `'/api/share/'`. Per LESSONS#0091 / #0104 — verify at pickup
  time the prefix STILL covers the new subpath.
- `tests/lib/sibling-invite-utils.test.ts` (new, `.test.ts` per LESSONS#0020 / #38).
- `tests/api/share-sibling-invite-candidate.test.ts` (new). Per LESSONS#0092 / #0100 —
  if extending any from-chain that has hand-rolled mock queues elsewhere, drain
  `mockReturnValueOnce` queues in `beforeEach` to avoid LESSONS#0049 queue spillover.
- `tests/api/share-sibling-invite.test.ts` (new) — mock `sendEmail`; assert dedupe
  + rate-limit; assert 200 success path writes the row.
- `tests/components/sibling-invite-card.test.tsx` (new) — assert data-share-url +
  data-testid; assert pre-fill; assert Send dispatches POST.
- `tests/e2e/sibling-invite-flow.spec.ts` (new). Seed extension in
  `tests/e2e/fixtures/seed.sql`: ONE new `auth.users` row (LESSONS#0084), ONE new
  `coaches` row for the OTHER coach (NOT the seeded E2E coach), ONE new `teams` row
  + `team_coaches` join row, ONE new `players` row with the SAME `parent_email` as
  the existing E2E player. UUIDs in `0000000000c0+` range (LESSONS#0101). Per
  LESSONS#0085 — wrap any jsonb literals correctly. Per LESSONS#0086 — confirm seed
  rows fit any CHECK constraints. Skip when E2E creds are unset.
- `tests/migrations/056-parent-initiated-invites.test.ts` (new) — scan the migration
  SQL (LESSONS#0088 strip `--` comments) for the column allow-list; assert no
  `date_of_birth` / `parent_phone` / `parent_email` columns; assert
  `sibling_first_name` is nullable text.
- New deps: NO. Migration: YES (056). Env vars: NO new (existing `sendEmail` config
  carries the From address). AI prompt change: NO (this is a template, not an AI
  call). Tier feature key: NO new key (the loop stays open).
- LESSONS to anchor: #0006 (migration prefix uniqueness), #0009 (server vs client
  component fetch posture), #0020 / #38 (.test.ts not .spec.ts), #0023 (instruct
  positively for voice), #0033 (commit message via -F file), #0049 / #0092 / #0100
  (mock queue spillover when extending shared from-chains), #0056 / #0082
  (data-share-url + data-testid for share controls), #0057 (team_coaches not
  teams.coach_id), #0084 / #0085 / #0086 / #0101 (seed posture), #0088 (strip --
  comments before migration body lint), #0091 / #0104 (publicPaths verification),
  #0096 (schema wins over prose — read actual `parent_shares` / `players` columns
  at pickup time).

## Implementation log

- 2026-06-01 [dev/0060] Starting work. Branch `feat/0060-parent-sibling-invite`.
  Reconciliations from schema-wins-over-prose (LESSONS#0096):
  - `parent_shares` has NO `parent_email` column; the parent-email edge ONLY
    lives on `players.parent_email`. Candidate lookup matches on
    `players.parent_email` (case-insensitive), same team's coach as the
    inviting parent's source player's parent_email.
  - Components live under `src/components/share/`, not `src/components/parent/`
    (the share-page convention used by 0011/0019/0050).
  - Migration prefix: `056_parent_initiated_invites.sql` is the next free
    integer after `055_player_handoffs.sql`.
  - Dedup table column name keeping ticket AC list verbatim:
    `id, from_share_token, from_player_id, to_coach_email,
    sibling_first_name, program_id, sent_at, referral_code`. NO `parent_email`,
    NO `parent_phone`, NO sibling LAST name, NO `date_of_birth`.
  - Per LESSONS#0023: voice contract instructs positively in code comments,
    never enumerates banned tokens in user-visible template strings.
  - Per ticket: NOT tier-gated; the route does NOT import `tier.ts`.
  - From address: existing `noreply@sportsiq.app` (real default in
    `src/lib/email.ts`); ticket prose said `noreply@youthsportsiq.com` —
    reconciling to the real codebase default.
