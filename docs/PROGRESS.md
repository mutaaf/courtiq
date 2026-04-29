# SportsIQ — Active Work Progress

This file tracks the curriculum + onboarding + analytics initiative so any
agent picking up the work has full context. Update it as tasks complete.

**Last updated:** 2026-04-28
**Owner of last commit:** Claude (Opus 4.7)

---

## Big-picture goals (status)

1. **Coaches can edit the curriculum** — ✅ shipped. Custom skills with full Add/Edit/Delete UI on `/curriculum`.
2. **Onboarding gets a coach to first capture, fast** — ✅ shipped. Combined sport+team setup, smart roster (skip/sample/real), first-capture moment replaces static tutorial, demo-team route from signup.
3. **Player names with non-standard pronunciation** — ✅ shipped. Captured during roster onboarding, fed into AI segmentation prompt.
4. **Product analytics** — ✅ shipped. PostHog wired with identifyUser + reset + 30+ instrumented events across the conversion funnel.

---

## Migrations to apply

These are written but **not yet run against the live DB** — apply before next deploy:

1. `supabase/migrations/026_team_custom_skills.sql` — required for curriculum custom-skills UI to do anything.
2. `supabase/migrations/027_player_team_flags.sql` — required for sample players + demo team.

```
psql $DATABASE_URL -f supabase/migrations/026_team_custom_skills.sql
psql $DATABASE_URL -f supabase/migrations/027_player_team_flags.sql
```

If these aren't applied, the relevant queries fail gracefully (custom skills query returns []; sample/demo flags fall back to defaults).

---

## What's shipped this session

### ✅ PostHog analytics infrastructure
- `src/lib/analytics.ts` — `trackEvent`, `identifyUser`, `resetAnalytics`. No-ops without `NEXT_PUBLIC_POSTHOG_KEY`.
- `src/components/ui/analytics-init.tsx` mounted in root layout.
- `DashboardShell` calls `identifyUser(coach.id, { org_id, tier })` on auth, `resetAnalytics()` on sign-out.
- Env vars set in `.env.local` (key + host).

### ✅ Analytics events wired (30+ across funnel)

**Onboarding funnel:**
- `onboarding_started` (setup page)
- `onboarding_setup_submitted` / `onboarding_setup_failed`
- `onboarding_roster_submitted` `{ mode: 'one-by-one' | 'paste' | 'sample' | 'skip', count, with_pronunciation }`
- `onboarding_first_capture_viewed` / `_started` / `_succeeded` / `_failed` / `_skipped`
- `onboarding_completed` `{ via, had_observation, plan_intent }`
- `onboarding_demo_started` / `_succeeded` / `_failed`

**Capture flow:**
- `capture_record_started` `{ team_id, from_session }`
- `capture_record_stopped` `{ duration_s, segments, transcript_chars }`
- `capture_observations_saved` `{ count, matched_to_player, unmatched, source, from_session }`

**Plans:**
- `plan_generation_started` `{ type, smart_mode, focus_skill_count }`
- `plan_generated` / `plan_generation_failed`

**AI Assistant:**
- `assistant_query_sent` `{ message_chars, turn_index, via_voice }`
- `assistant_response_received` `{ response_type, has_structured }`
- `assistant_response_failed`

**Sessions / Roster:**
- `session_created` `{ type, has_opponent, has_location, has_curriculum_week }`
- `player_added` `{ has_jersey, has_parent_contact }`

**Curriculum:**
- `curriculum_custom_skill_added` / `_edited` / `_deleted`

**Tier / billing:**
- `upgrade_checkout_started` / `_failed`

**Activation:**
- `welcome_tour_shown` / `welcome_tour_completed`

PostHog autocapture handles raw clicks + pageviews, so we only fire custom events for state transitions and conversion moments.

### ✅ Curriculum custom skills (full feature)
- Migration 026, types, `getMergedCurriculum` helper, AI context wiring.
- New component `src/components/curriculum/custom-skill-sheet.tsx` — bottom sheet for Add + Edit. Validation + slug generation + collision-safe `custom:<slug>_<hash>` skill IDs.
- `src/app/(dashboard)/curriculum/page.tsx` — merged read, "Custom" pills on coach skills, edit/delete buttons inline, Add button per category section + global, empty-state CTA when no curriculum is assigned.

### ✅ Player name pronunciation
- Captured during roster onboarding (one-by-one mode), persisted as `players.name_variants`.
- AI segmentation prompt already consumed it (`prompts.ts:85`); no AI change needed.
- Edit page already had the field.
- `/api/auth/add-players` accepts `{ players: [{ name, name_variants? }] }` shape (legacy `playerNames` still works).

### ✅ Onboarding 2A — combined sport + team
- `/api/auth/configure-team` does sport + team in one round-trip.
- `/onboarding/setup` page collapses sport + team + age group + season.
- Legacy `/onboarding/sport`, `/onboarding/team` redirect to `/onboarding/setup`.
- All redirect targets updated (callback, signup, dashboard layout, home).

### ✅ Onboarding 2B — smart roster step
- Migration 027 adds `players.is_sample` + `teams.is_demo`.
- Roster page promotes "Try with sample players" + "Add players later" to top of card.
- Sample mode posts `{ sample: true }` and seeds 8 fictional players flagged `is_sample = true`.
- `/api/share/create` rejects sharing sample players.

### ✅ Onboarding 2C — first-capture moment
- `src/app/(auth)/onboarding/first-capture/page.tsx` — big mic, voice → segmentation → success card with the actual observation.
- New `/api/auth/me-team` endpoint resolves the coach's first team for segmentation context.
- Legacy `/onboarding/tutorial` redirects to `/onboarding/first-capture`.
- Roster step now pushes to `/onboarding/first-capture` instead of `/onboarding/tutorial`.

### ✅ Onboarding 2D — demo team route
- `/api/auth/seed-demo` creates `teams.is_demo = true` with 8 sample players, 2 sessions, 8 seeded observations across them. Idempotent per org.
- `/onboarding/demo` page with single CTA. "Just exploring? Try a demo team" link added to signup page footer.
- Demo team is hidden by `is_demo` flag — no automatic deletion (preserves retention experiments).

### ✅ Onboarding 2E — welcome tour trim
- Trimmed from 5 steps to 3: Capture FAB, Sessions, Plans (dropped Welcome screen, Roster, Assistant, Final screen).
- Trigger changed: tour now only fires AFTER coach has at least one real observation. Layout passes `enabled` based on observation count.
- Dashboard mobile nav now has `data-tour={label}` attributes for the spotlight selectors.
- Fires `welcome_tour_shown` and `welcome_tour_completed` events.

### ✅ Mobile UI polish (earlier in session)
- Tab bar clearance: spacer div in `DashboardShell` with `min-h-full` on `PageTransition`.
- `FULL_BLEED_PATHS` lets `/assistant` opt out of the spacer.
- All `fixed`/`sticky bottom-X` elements lifted clear of mobile nav.
- Sessions detail header restructured. Drill library no longer bleeds outside the bordered carousel.

### ✅ Stripe smoke test
- `scripts/stripe-smoke.js` walks Checkout → Portal → optional cancel against test mode.

---

## What's NOT shipped yet (deferred — next-agent queue)

### Curriculum follow-ups
- **Fork-on-edit** for built-in skills. New table `team_curriculum_overrides`; first edit clones the base curriculum to a per-team copy. Spec'd in earlier turns of this thread but not started — the additive-overrides model covers ~90% of coach asks and ships safely.
- **Drill ↔ custom-skill linking.** `drills.curriculum_skill_id` is a UUID FK that can't reference custom skills today. Add a join table `drill_custom_skill_links(drill_id, custom_skill_id)` if recommendation engine needs to suggest custom-skill-targeted drills.
- **50-skill soft cap warning** in the custom-skill sheet (matches the AI-context spec). Pure UI nag, no backend.

### Onboarding follow-ups
- **First-capture: support upload audio file fallback** when Web Speech API unavailable (Safari iOS desktop, etc.). Currently the page shows "not supported on this browser" and only allows skip.
- **First-capture: show "Try again" after a failed attempt** without resetting the page state.
- **Demo team: opt-in to the welcome tour automatically** so the spotlighted FAB matches the demo data.
- **Demo team: AI-generated practice plan** — currently the demo seeds players + sessions + observations but no plan. Add a server-side plan generation in `seed-demo/route.ts`.

### Analytics follow-ups
- **Funnel dashboard in PostHog** — `onboarding_started → onboarding_setup_submitted → onboarding_roster_submitted → onboarding_first_capture_succeeded → onboarding_completed`. Build this in PostHog UI; no code change needed.
- **Identify on signup**, not just on dashboard mount. Right now anonymous events from the signup/setup pages get merged on first dashboard visit, but if a coach bounces before reaching `/home` we miss the merge.
- **Share view event** on the public `/share/[token]` page (server-rendered). Either hydrate a thin client component to fire `parent_report_viewed`, or rely on PostHog autocapture pageviews (less rich props but free).

---

## Files touched this session

**New:**
- `src/lib/analytics.ts`
- `src/components/ui/analytics-init.tsx`
- `src/lib/curriculum/merged.ts`
- `src/components/curriculum/custom-skill-sheet.tsx`
- `src/app/(auth)/onboarding/setup/page.tsx`
- `src/app/(auth)/onboarding/first-capture/page.tsx`
- `src/app/(auth)/onboarding/demo/page.tsx`
- `src/app/api/auth/configure-team/route.ts`
- `src/app/api/auth/me-team/route.ts`
- `src/app/api/auth/seed-demo/route.ts`
- `supabase/migrations/026_team_custom_skills.sql`
- `supabase/migrations/027_player_team_flags.sql`
- `scripts/stripe-smoke.js`
- `docs/PROGRESS.md`

**Modified (analytics + onboarding redirects):**
- `src/app/layout.tsx`
- `src/app/(dashboard)/layout.tsx` — observation count check + redirect to /setup
- `src/app/(dashboard)/curriculum/page.tsx` — merged skills + edit UI
- `src/app/(dashboard)/capture/page.tsx` — record events
- `src/app/(dashboard)/capture/review/page.tsx` — observations saved event
- `src/app/(dashboard)/plans/page.tsx` — plan_generation events
- `src/app/(dashboard)/assistant/page.tsx` — assistant events + bottom-pad fix
- `src/app/(dashboard)/sessions/new/page.tsx` — session_created
- `src/app/(dashboard)/roster/add/page.tsx` — player_added
- `src/app/(dashboard)/settings/upgrade/page.tsx` — upgrade_checkout_started
- `src/app/(auth)/signup/page.tsx` — redirect to /setup + demo CTA
- `src/app/(auth)/onboarding/sport/page.tsx` — redirect shim
- `src/app/(auth)/onboarding/team/page.tsx` — redirect shim
- `src/app/(auth)/onboarding/tutorial/page.tsx` — redirect to /first-capture
- `src/app/(auth)/onboarding/roster/page.tsx` — pronunciation + sample mode + smart skip + analytics
- `src/app/api/auth/callback/route.ts` — redirect to /setup
- `src/app/api/auth/add-players/route.ts` — supports sample mode + name_variants
- `src/app/api/share/create/route.ts` — rejects sample-player sharing
- `src/components/layout/dashboard-shell.tsx` — identifyUser + resetAnalytics + data-tour anchors + bottom-pad logic
- `src/components/layout/page-transition.tsx` — `h-full` → `min-h-full`
- `src/components/onboarding/welcome-tour.tsx` — trimmed to 3 steps + enabled prop + analytics
- `src/lib/ai/context-builder.ts` — merge custom skills into prompts
- `src/types/database.ts` — TeamCustomSkill + MergedSkill
- `.env.local.example` + `.env.local`

---

## Quick start for next agent

1. Read this file top to bottom.
2. Apply the two pending migrations (026 + 027) to the live DB.
3. Confirm PostHog events flowing: open PostHog dashboard → Live Events → reload `/onboarding/setup` and watch for `onboarding_started`. Onboarding funnel: `Insights → New funnel → onboarding_started, onboarding_setup_submitted, onboarding_roster_submitted, onboarding_first_capture_succeeded, onboarding_completed`.
4. Pick from the deferred queue based on what the funnel data shows is leaking.
5. If extending curriculum custom skills, the natural next step is a 50-skill soft cap warning in the sheet, then drill ↔ custom-skill linking (most-asked feature once coaches use the editor for a while).
