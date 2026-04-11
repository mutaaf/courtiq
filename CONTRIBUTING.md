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
- [ ] Ensure all buttons/links on every page lead to real functionality
- [ ] Remove any remaining `[object Object]` or raw JSON in UI
- [ ] Fix any broken navigation or dead links
- [ ] Ensure all forms save data correctly
- [x] Improve loading states (skeleton screens, not blank pages) — home page stats + Team Pulse skeleton done
- [x] Add pull-to-refresh on mobile pages — PullToRefresh component on Home, Sessions, Roster, Plans; haptic feedback at threshold + on complete
- [x] Add swipe gestures for navigation — useSwipeNavigation hook; left/right swipe cycles Home→Assistant→Capture→Plans→Settings; 80px threshold + vertical-ratio guard avoids conflict with scroll and pull-to-refresh
- [x] Smooth page transitions/animations — CSS fade-in + slide-up via PageTransition component, respects prefers-reduced-motion

### P2 — AI Intelligence
- [ ] Better phonetic matching in observation segmentation
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
- [ ] Export data as PDF/CSV
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
- [ ] **Referral system** — "Invite a coach, get 1 month free" with tracking link and reward
- [ ] **In-app testimonial prompts** — after 10 observations, prompt coach for a review/rating
- [ ] **Social sharing** — "Share your season stats" cards optimized for Instagram/Twitter/Facebook
- [ ] **Onboarding email drip** — trigger emails: Day 1 (welcome), Day 3 (first capture tips), Day 7 (generate first plan), Day 14 (share with parents)
- [ ] **Coach leaderboard** (opt-in) — gamify engagement: observations recorded, plans generated, parent shares sent. Badge system (Rookie Coach → Elite Coach)
- [ ] **Program landing pages** — `/org/[slug]` white-label pages for YMCA branches to recruit coaches
- [ ] **"SportsIQ Certified Coach" badge** — coaches who complete curriculum and hit observation thresholds get a shareable digital badge
- [ ] **Seasonal promotions** — auto-detect season start (Sept/Jan/Apr) and show relevant onboarding: "New season? Import your roster and set up your curriculum"
- [ ] **Parent viral loop** — parent portal includes "Is your coach using SportsIQ? Share this with them" CTA when they see how good the reports are
- [ ] **Freemium upgrade nudges** — contextual upgrade prompts: "You've hit 5 observations this month. Upgrade to Coach for unlimited." Show value before asking

### P6 — Strategic Platform Features
- [ ] **Multi-season history** — archive past seasons, compare player progress across seasons
- [ ] **Cross-team analytics (org)** — program directors see aggregate data: which skills are strongest/weakest across all teams, which coaches are most engaged
- [ ] **Curriculum marketplace** — orgs can publish their custom curricula, other orgs can import them
- [ ] **Parent engagement scoring** — track which parents open reports, view progress. Identify disengaged families for coach follow-up
- [ ] **AI coaching tips** — proactive suggestions: "You haven't observed Sarah in 2 weeks" or "Your team's defense observations are declining — consider a defensive drill block"
- [ ] **Export/print** — PDF report cards, practice plans, and season summaries for coaches without reliable internet
- [ ] **Bulk operations** — select multiple players for group observations, bulk share links, bulk report cards
- [ ] **Integration webhooks** — notify external systems (Slack, email, TeamSnap) on key events

### P7 — Performance & PWA
- [ ] Service worker for offline app shell
- [ ] Install prompt (add to home screen) with custom banner
- [ ] Image/asset lazy loading with blur placeholders
- [ ] Code splitting for dashboard routes
- [ ] Optimistic updates on mutations (instant UI feedback)
- [ ] Background sync for observations captured offline
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
- [ ] Error boundary components on all pages
- [ ] Sentry or similar error tracking integration
- [ ] API rate limiting on AI endpoints

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
