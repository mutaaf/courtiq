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
- [ ] Add pull-to-refresh on mobile pages
- [ ] Add swipe gestures for navigation
- [x] Smooth page transitions/animations — CSS fade-in + slide-up via PageTransition component, respects prefers-reduced-motion

### P2 — AI Intelligence
- [ ] Better phonetic matching in observation segmentation
- [ ] Smart practice plan generation from observation data trends
- [ ] Post-session auto-debrief improvements
- [ ] Drill recommendation engine based on skill gaps
- [ ] Game day prep based on opponent tendencies
- [ ] Auto-generate weekly parent newsletter from observations

### P3 — Data & Analytics
- [ ] Player comparison view (side-by-side skill radar)
- [ ] Team progress over time (line charts)
- [ ] Session-over-session improvement tracking
- [ ] Practice-to-game transfer score visualization
- [ ] Export data as PDF/CSV
- [ ] Observation heatmap (which players get most attention)

### P4 — New Features
- [ ] Drill builder (AI-assisted, save custom drills)
- [ ] Game stat tracker (live scoring during games)
- [ ] Practice timer with drill rotation alerts
- [ ] Team calendar/schedule
- [ ] Coach-to-coach messaging within org
- [ ] Player self-assessment (age 13+)
- [ ] Season summary report generator

### P5 — Performance & PWA
- [ ] Service worker for offline app shell
- [ ] Install prompt (add to home screen)
- [ ] Image/asset lazy loading
- [ ] Code splitting for dashboard routes
- [ ] Optimistic updates on mutations
- [ ] Background sync for observations

### P6 — Accessibility
- [ ] ARIA labels on all interactive elements
- [ ] Keyboard navigation for all pages
- [ ] Screen reader testing
- [ ] Focus trap in modals/dialogs
- [ ] Color contrast verification (WCAG AA)
- [ ] Reduce motion preference support

### P7 — Testing
- [ ] Component tests for key UI (roster card, recording button, plan card)
- [ ] Integration tests for API routes (config, segment, plan)
- [ ] E2E test: signup → onboarding → capture → review → save
- [ ] E2E test: generate plan → view plan
- [ ] E2E test: create share link → view parent portal

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
