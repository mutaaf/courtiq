# Contributing to SportsIQ

## For the Innovation Agent

You run every hour. Here's how to be effective.

### Your Workflow
1. `git pull origin main` — always start fresh
2. Read `CLAUDE.md` for architecture context
3. Read this file for what to work on
4. Pick ONE task from the priority list below
5. Implement it completely (not a stub)
6. Verify: `npx tsc --noEmit && npm run lint && npx vitest run`
7. Commit and push

### Priority Rules
1. **Never break existing features** — if tests fail, fix before pushing
2. **One change per run** — focused and complete
3. **Check the roadmap** — work on the highest-priority item you can complete in one session
4. **Don't duplicate** — check git log to see what was recently done

---

## Current Priority Queue

### P0 — Critical Fixes (do these first if they exist)
- [ ] Fix any TypeScript errors
- [ ] Fix any failing tests
- [ ] Fix any lint errors
- [ ] Fix any runtime errors reported in recent commits

### P1 — Core UX Polish
- [x] Ensure all buttons/links on every page lead to real functionality — AI assistant "Add to Drills" saves drill structured_data via /api/ai/save-drill; "Share with Parents" copies formatted report to clipboard; both show success state + toast
- [x] Remove any remaining `[object Object]` or raw JSON in UI — audit log viewer now uses formatConfigValue helper (human-readable inline format for strings/arrays/objects); plans page renderObjectFields already guarded
- [x] Fix any broken navigation or dead links — UpgradeGate "View Plans" was pointing to /settings with no pricing; now routes to /settings/upgrade
- [x] Ensure all forms save data correctly — admin role-change now rolls back optimistic update + shows error if PATCH fails (was silently leaving UI in wrong state)
- [x] Improve loading states (skeleton screens, not blank pages) — home page stats + Team Pulse skeleton done
- [x] Add pull-to-refresh on mobile pages — PullToRefresh component on Home, Sessions, Roster, Plans; haptic feedback at threshold + on complete
- [x] Add swipe gestures for navigation — useSwipeNavigation hook; left/right swipe cycles Home→Assistant→Capture→Plans→Settings; 80px threshold + vertical-ratio guard avoids conflict with scroll and pull-to-refresh
- [x] Smooth page transitions/animations — CSS fade-in + slide-up via PageTransition component, respects prefers-reduced-motion

### P2 — AI Intelligence
- [x] Better phonetic matching in observation segmentation — `src/lib/player-match.ts` (Soundex + Levenshtein); replaces inline `findPlayerId` in capture/review and quick-capture-widget; 26 unit tests
- [x] Smart practice plan generation from observation data trends — two-window trend analysis (last 7 vs prior 7 days) classifies skills as Declining/Persistent/Improving; AI prompt gets prioritised drill-time rules; Plans page badge shows colour-coded trend pills
- [x] Post-session auto-debrief improvements — multi-session trend context: fetches last 3 prior debriefs, AI generates trend_note comparing to recent history, recurring areas flagged with badge + persistent focus areas chip row
- [x] Drill recommendation engine based on skill gaps — analyzes needs-work observations (last 30 days), surfaces matching drills in a "Recommended for Your Team" carousel at the top of the Drills Library; sorted by gap severity, up to 6 drills
- [x] Game day prep based on opponent tendencies — dedicated form in Plans page: enter opponent name, strengths, weaknesses, key players; AI generates full prep sheet with scouting report (threat levels, defensive assignments), offensive/defensive game plan, set plays, lineup, halftime adjustments, and sideline reminders
- [x] Auto-generate weekly parent newsletter from observations — AI-written team newsletter with player spotlights, home challenges, team highlight, and coaching note; saved as plan type `newsletter` with rich renderer; violet-themed generation button in Plans page

### P3 — Data & Analytics
- [x] Player comparison view (side-by-side skill radar) — /roster/compare; SVG radar chart (shared skills, up to 12 axes), side-by-side progress bars for all skills, per-player summary stats; Compare button in roster header when 2+ players
- [x] Team progress over time (line charts) — SVG line chart in Analytics page: weekly health score % (emerald line, colour-coded dots) + observation volume (orange area), smoothed Bézier curves, gap handling for weeks with no data, trend delta label
- [x] Session-over-session improvement tracking — per-session health score chart in Analytics; purple line + type-colored dots (practice=orange, game=blue, scrimmage=purple, tournament=amber, training=teal), dot size = obs count, trend delta badge
- [x] Practice-to-game transfer score visualization — dual-bar card in Analytics: practice health% vs game health% per player + team aggregate; color-coded transfer delta (green=skills transfer, amber=slight drop, red=sharp drop); sorted by transfer delta
- [x] Export data as PDF/CSV — CSV export (observations, roster, sessions) via GET /api/export; Export dropdown in Analytics page header triggers browser file download
- [x] Observation heatmap (which players get most attention) — player × week SVG grid in Analytics; cell colour = observation intensity (sqrt-scaled orange), count label inside cell, tooltip on hover, colour legend; top 14 players sorted by total obs

### P4 — Innovative Features (Differentiators)
- [x] **"Quick Capture" widget** — floating Zap button (bottom-right, above mobile nav) on every dashboard page except /capture. One tap opens a bottom sheet: record, auto-segments with AI, saves observations directly — no review step or navigation required. Haptic feedback, live transcript, success/error states, auto-closes after save
- [x] **AI Practice Timer** — start a practice session timer that shows current drill, countdown, coaching cues, and auto-prompts "what did you observe?" between drills. Full guided practice mode — setup screen (library drills + custom), full-screen countdown, rotating coaching cues, between-drill observation capture with player tagging, batch save to session on done
- [x] **Live Game Stat Tracker** — tap-based stat entry during games (made shot, miss, rebound, assist, steal, turnover). Per-player buttons, live box score, saves W/L/T result to session. Stats stored as observations (no new tables). Game Stats button on session detail header for game/scrimmage/tournament sessions
- [x] **"Coach Replay"** — after a session, show a timeline of all observations with timestamps. Chronological view with per-player color coding, relative timestamps (+m:ss), 15-min bucket headers, sentiment breakdown strip, and inline edit (text + sentiment). Located at /sessions/[id]/replay, linked via Replay button in session header
- [x] **Skill Challenge Cards** — AI generates weekly skill challenges for each player based on their growth areas. Shareable cards parents can use for at-home practice. 1-3 challenge cards with steps, success criteria, difficulty badge; "Copy for parents" plain-text export; saved as plan type `skill_challenge` with player_id
- [x] **Smart Substitution Planner** — input game length + player count, AI generates fair rotation ensuring equal playing time. Tracks actual minutes played. 3-step flow: setup (game format + player selection) → rotation grid view → live tracking with game clock, on-court/bench display, and sub alerts
- [x] **Season Storyline** — AI generates a narrative arc of each player's season ("Marcus started exploring dribbling in Week 1 and by Week 8 was running pick-and-roll confidently"). Chapters by phase (Early Season / Building / Breakthrough), current strengths, trajectory, and coach reflection. Accessible from Plans page (player dropdown) and player detail Storyline tab.
- [x] **Drill builder** — AI-assisted custom drill creator. Describe what you want, AI generates drill with setup, coaching cues, variations, and links to curriculum skills. Bottom sheet on /drills with textarea, category chips, duration selector, example prompts; saved to drills table with source='ai'; AI badge in library grid
- [x] **Team Calendar** — monthly calendar view of sessions; tap any day to see/schedule sessions; colored dots by type; upcoming sessions list; ?date= pre-fills new session form; CalendarDays icon in sidebar
- [x] **Player self-assessment** (age 13+) — players rate themselves on skills (1–5 stars) per skill tracked in proficiency; coach sees self-rating vs coach level side-by-side; saved as plan type `self_assessment`; history with expand/collapse and +/- vs coach indicator; teal theme, COPPA-compliant framing

### P5 — GTM & Growth
- [x] **Referral system** — "Invite a coach, get 1 month free" with tracking link and reward; GET /api/referrals lazy-generates a 6-char code, counts referrals via preferences.referred_by_code; signup ?ref=CODE captured and stored on account creation; /settings/referrals page with Copy/Email/Share, stats, reward banner
- [x] **In-app testimonial prompts** — after 10 observations, prompt coach for a review/rating; NPS-style 1-5 star modal; high ratings surface a "share with colleague" mailto CTA; low ratings open a feedback email; snoozed 30 days on Later, permanently dismissed on submit; state stored in localStorage by coachId
- [x] **Social sharing** — "Share your season stats" card modal in Analytics page; preview card (health ring, obs/players/sessions, strengths/focus areas chips); Share button uses Web Share API on mobile, clipboard fallback on desktop; "Share" button in analytics header (disabled when no data)
- [x] **Onboarding email drip** — 4-email sequence (Day 1 welcome, Day 3 Quick Capture tips, Day 7 generate first plan, Day 14 share with parents); fetch-based Resend sender (no SDK); tracking in coach.preferences.drip_sent; POST /api/cron/drip-emails batches all coaches; Vercel cron runs daily at 09:00 UTC; CRON_SECRET auth; 24 unit tests
- [x] **Coach leaderboard** (opt-in) — gamify engagement: observations recorded, plans generated, parent shares sent. Badge system (Rookie Coach → Elite Coach); /settings/leaderboard with opt-in toggle, personal stats card, org rankings with anonymized names, badge chips, score formula breakdown
- [x] **Program landing pages** — `/org/[slug]` white-label pages for YMCA branches to recruit coaches; public API GET /api/org/[slug] returns org, branding, teams, and stats; landing page shows logo (with branding colors), team roster by age group, feature highlights, and coach CTA with org slug pre-filled on signup link
- [x] **"SportsIQ Certified Coach" badge** — coaches who hit 4 milestones (25+ obs, 5+ sessions, 3+ plans, 3+ active players) earn a shareable digital badge; GET /api/certifications auto-grants on first qualifying call (stored in preferences.certified_at); /settings/certification shows amber certificate visual, per-criterion progress bars with %, and Web Share API / clipboard share buttons
- [x] **Seasonal promotions** — auto-detect season start (Sept/Jan/Apr) and show relevant onboarding: "New season? Import your roster and set up your curriculum"; SeasonalPromo component shown on home dashboard for first 21 days of Sept/Jan/Apr; 3 actions (Import Roster, Set Up Curriculum, Generate Plan); roster-aware messaging; per-season localStorage dismissal
- [x] **Parent viral loop** — parent portal includes "Is your coach using SportsIQ? Share this with them" CTA when they see how good the reports are
- [x] **Freemium upgrade nudges** — /settings/upgrade pricing page (tier cards + desktop feature-matrix table); Plans & Pricing card in settings hub; UpgradeGate "View Plans" link fixed; FreemiumNudge banner on home page with contextual message (player-limit, AI-usage, generic) dismissible 3 days via localStorage

### P6 — Strategic Platform Features
- [x] **Multi-season history** — archive past seasons, compare player progress across seasons; season_archives table with player-skill snapshot JSON; GET/POST /api/seasons; /settings/seasons page with archive form, stats strip, collapsible per-player skill snapshot (proficiency level + trend icons)
- [x] **Cross-team analytics (org)** — program directors see aggregate data: which skills are strongest/weakest across all teams, which coaches are most engaged; /admin/org-analytics with summary cards, team health rings, coach engagement leaderboard (weighted score: obs×1 + sessions×3 + plans×2), and cross-team skill breakdown with sentiment strips; linked from admin panel
- [x] **Curriculum marketplace** — orgs can publish their custom curricula, other orgs can import them; GET /api/marketplace lists public curricula with skill counts; POST publish (pro_coach+ tier) toggles visibility with publisher_name; POST import deep-copies curriculum + skills to importer's org and bumps import_count; /marketplace page: search grid, sport badges, import count, one-tap import, Manage Published tab with publish modal; Marketplace link in sidebar
- [x] **Parent engagement scoring** — track which parents open reports, view progress. Identify disengaged families for coach follow-up; GET /api/parent-engagement scores each player's family (engaged/moderate/stale/never_opened/unshared); ParentEngagementPanel on /roster shows stacked progress bar + expandable follow-up list with days-since-viewed and deep-links to player profiles
- [x] **AI coaching tips** — proactive suggestions: "You haven't observed Sarah in 2 weeks" or "Your team's defense observations are declining — consider a defensive drill block"; color-coded card on home dashboard (alert/suggestion/praise) with action links; 4-hour staleTime cache; shown after 5+ observations
- [x] **Export/print** — Print / Save as PDF for report cards, practice plans (all types), and analytics summary; PrintButton component; @media print CSS converts dark zinc theme to white/black, hides nav chrome and interactive buttons, keeps accent colours; "Print / PDF" button on Report Card tab, plan detail view, and Analytics page header
- [x] **Bulk operations** — select multiple players for group observations, bulk share links, bulk report cards; CheckSquare Select toggle in roster header, circular checkboxes on cards, BulkActionsBar with "Add Observation" modal (batch insert per selected player) and "Share Reports" (batch share link generation + clipboard copy)
- [x] **Integration webhooks** — notify external systems (Slack, email, TeamSnap) on key events; HMAC-SHA256 signed POST to registered HTTPS endpoints; events: observation.created, session.created/updated, plan.created, player.created; /settings/webhooks with test ping, active toggle, one-time secret reveal

### P7 — Performance & PWA
- [x] Service worker for offline app shell — vanilla SW (public/sw.js): Cache-First for _next/static and images, Network-First for pages with /offline fallback, Network-Only for /api; SwRegister in root layout; /offline public page added to middleware allowlist
- [x] Install prompt (add to home screen) with custom banner — PwaInstallPrompt component: listens for beforeinstallprompt, shows after 2 visits, dismissible for 14 days, positioned above mobile bottom nav
- [ ] Image/asset lazy loading with blur placeholders
- [x] Code splitting for dashboard routes — `next/dynamic` for 4 analytics charts (LineChart, SessionTrendChart, HeatmapGrid, TransferScoreChart) extracted to `src/components/analytics/`; shared types/helpers in `chart-utils.ts`; QuickCaptureWidget lazy-loaded in DashboardShell (ssr:false); analytics page 1924→1365 lines
- [x] Optimistic updates on mutations (instant UI feedback) — game tracker stat/undo mutations; `onMutate` updates cache instantly, `onSettled` syncs; stat buttons no longer blocked while pending; error haptic on failure; undo hidden for un-persisted optimistic entries
- [x] Background sync for observations captured offline — useSyncEngine hook wires online/offline monitoring + periodic sync engine; review page falls back to IndexedDB when offline with amber "Saved Locally" success state; sync engine uses mutate() (API route) instead of direct Supabase client; service worker handles BackgroundSync 'sync' event and notifies open clients; 9 unit tests
- [ ] Prefetch adjacent pages on hover/focus

### P8 — Accessibility
- [ ] ARIA labels on all interactive elements
- [ ] Keyboard navigation for all pages
- [ ] Screen reader testing with VoiceOver/NVDA
- [ ] Focus trap in modals/dialogs
- [ ] Color contrast verification (WCAG AA minimum)
- [ ] Reduce motion preference support
- [ ] High contrast mode toggle

### P9 — Testing & Reliability
- [ ] Component tests for key UI (roster card, recording button, plan card)
- [ ] Integration tests for API routes (config, segment, plan, share)
- [ ] E2E test: signup → onboarding → capture → review → save
- [ ] E2E test: generate plan → view plan → delete plan
- [ ] E2E test: create share link → view parent portal
- [ ] E2E test: admin panel → invite coach → change role
- [x] Error boundary components on all pages — global-error.tsx (layout-level), app/error.tsx (public pages), (dashboard)/error.tsx (all dashboard pages), (auth)/error.tsx (login/signup/onboarding); AlertTriangle + reset() + home link; prevents blank-page crashes
- [ ] Sentry or similar error tracking integration
- [x] API rate limiting on AI endpoints — 20 req/hour per coach (configurable via AI_RATE_LIMIT_PER_HOUR); Redis sliding window with in-memory fallback; RateLimitError → 429 + Retry-After header; handleAIError() shared handler across all 14 AI routes; 10 unit tests

---

## Architecture Rules

### Data Access
```typescript
// CLIENT SIDE — always use the API helpers
import { query, mutate } from '@/lib/api';

// SERVER SIDE (API routes) — always use service role
import { createServiceSupabase } from '@/lib/supabase/server';
const admin = await createServiceSupabase();
```

Never use `createClient()` from `@/lib/supabase/client` for database queries. It gets blocked by RLS. The only exception is `supabase.auth.signOut()`.

### Adding New Tables
1. Add to `supabase/migrations/` as a new numbered migration
2. Add types to `src/types/database.ts`
3. Add to the whitelist in `/api/data/route.ts` and `/api/data/mutate/route.ts`

### Adding Feature-Gated Content
```tsx
import { UpgradeGate } from '@/components/ui/upgrade-gate';

export default function MyPage() {
  return (
    <UpgradeGate feature="my_feature" featureLabel="My Feature">
      <ActualContent />
    </UpgradeGate>
  );
}
```
Add the feature key to `TIER_LIMITS` in `src/lib/tier.ts`.

### AI Prompts
All AI prompts live in `src/lib/ai/prompts.ts`. When modifying:
- Keep prompts provider-agnostic (no Anthropic-specific features)
- Include ASR error handling instructions for voice-related prompts
- Include roster with name_variants for phonetic matching
- Zod validation should have try/catch fallback to raw output

### Styling
- Dark theme: `bg-zinc-950`, `text-zinc-100`, accent `orange-500`
- Light mode: CSS overrides in `globals.css` (`.light` class)
- Touch targets: minimum 44px (use `h-12` or `py-3 px-4`)
- Add `touch-manipulation active:scale-[0.98]` for tap feedback
- Use `sm:` prefix for desktop overrides (mobile-first)

---

## Commit Message Format

```
feat/fix/improve: [short description]

[Optional longer description]

Co-Authored-By: Claude Code Innovation Agent <noreply@anthropic.com>
```

## Files You Should NOT Modify
- `package.json` (don't add dependencies without good reason)
- `.env.local` (contains secrets)
- `supabase/config.toml`
- `.vercel/` directory
