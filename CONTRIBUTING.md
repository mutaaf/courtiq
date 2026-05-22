# Contributing to SportsIQ

This is the human-contributor reference. It documents the patterns and conventions of the codebase. If you're an autonomous agent, **read [`AGENTS.md`](./AGENTS.md) instead — it's the binding contract.**

## How work flows here

- **What's being built next**: the backlog at [`docs/backlog/`](./docs/backlog/) — one file per ticket, ordered in [`docs/backlog/README.md`](./docs/backlog/README.md). Pick the top `groomed` ticket or invoke `/ship` to delegate to the implementation-dev subagent.
- **What's already shipped**: the merged commit history (immutable record) and [`docs/CHANGELOG.md`](./docs/CHANGELOG.md) (prose archive of pre-2026-05-20 work). Per-ticket implementation logs live in each ticket's frontmatter going forward.
- **What we've learned the hard way**: [`docs/LESSONS.md`](./docs/LESSONS.md) — the loop's operational memory. Read it before debugging the same kind of failure twice.
- **What the contract is**: [`AGENTS.md`](./AGENTS.md). The non-negotiables there bind every contributor, human or AI.

## Where things go

- New feature ideas → a `docs/backlog/NNNN-*.md` ticket (use `docs/backlog/_template.md`). Don't add them to this file.
- A pattern you keep tripping over → a one-line entry in `docs/LESSONS.md`.
- A new architectural rule → this file's **Architecture Rules** section below, after you've discussed it.

### P62 — Weekly Parent Update UX
- [x] **Editable weekly parent update message in WeeklyWrapCard** — the home-dashboard "This Week's Update" card previously showed a 3-line truncated preview and sent a pre-built message coaches had never fully read; coaches now see the complete auto-generated message in the card with a ✏️ pencil button; tapping it opens a full editable textarea so coaches can personalise the player shoutout, adjust the tone, or remove anything that doesn't fit before sending; "Done editing" collapses the textarea; "Send to Parents" and "Copy" both use the edited text; data has a 10-min staleTime so the editable buffer is never refreshed during an active editing session; also installs `vitest` in `node_modules` (was in `package.json` but missing from `node_modules`, causing recurring "Cannot find type definition file for vitest/globals" TypeScript error on fresh checkouts); `Pencil` + `CheckCheck` icons added; zero new API routes, DB tables, or utility modules; PR #56

### P63 — Tappable Stats + Deep-link Type Param
- [x] **Tappable Players/Observations/Sessions stat cards + `?type=` param on `/sessions/new`** — the three home-dashboard stat cards (Players / Observations / Sessions) now wrap in `<Link>` elements pointing to `/roster`, `/observations`, and `/sessions` respectively, so coaches can navigate to the most-used list pages directly from the number they care about; `sessions/new` now reads a `?type=` URL query param via a lazy `useState` initialiser (validated against `SESSION_TYPES`, falls back to `'practice'` for null/invalid) enabling any deep-link in the app to land coaches on the new-session form with the correct type pre-highlighted; note: the originally-planned game-day quick-start grid (🏀/⚡/🏆) was dropped after rebase — main already ships an equivalent via `showGameQuickStart`/`quickStartGame`; zero new API routes, DB tables, or utility modules; PR #57

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

1. Add to `supabase/migrations/` as a new numbered migration.
2. Add types to `src/types/database.ts`.
3. Add to the whitelist in `/api/data/route.ts` and `/api/data/mutate/route.ts`.

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

Add the feature key to `TIER_LIMITS` in `src/lib/tier.ts`. **Also** call `canAccess(orgId, 'my_feature')` server-side in the API route — UI-only gates can be bypassed by anyone who reads the source.

### AI Prompts

All AI prompts live in `src/lib/ai/prompts.ts`. When modifying:
- Keep prompts provider-agnostic (no Anthropic-specific features).
- Include ASR error handling instructions for voice-related prompts.
- Include roster with name_variants for phonetic matching.
- Zod validation should have try/catch fallback to raw output.
- Calls go through `callAI()` / `callAIWithJSON()` from `src/lib/ai/client.ts` — never instantiate a provider SDK directly in a route.

### Stripe

- Never instantiate `new Stripe(...)` at module top — use the lazy `getStripe()` factory. (Module-top init crashed `next build` historically; see CHANGELOG.)
- Webhook signature verification is non-negotiable. Every webhook handler validates `stripe-signature` against `STRIPE_WEBHOOK_SECRET` before any DB write.
- Stripe products/prices and the path to going live are documented in `docs/OPS.md` and `scripts/stripe-go-live.js`.

### Styling

- Dark theme: `bg-zinc-950`, `text-zinc-100`, accent `orange-500`.
- Light mode (parent portal only): CSS overrides in `globals.css` (`.light` class) — gray-50 background, orange accent.
- Touch targets: minimum 44px (use `h-12` or `py-3 px-4`).
- Add `touch-manipulation active:scale-[0.98]` for tap feedback.
- Use `sm:` prefix for desktop overrides (mobile-first).
- No purple-gradient consumer-SaaS UI. No "AI for everything" copy. Banned words in user-facing text and AI prompt output: "journey", "amazing", "exciting", "elevate", "empower", "synergy", "unlock your potential".

---

## Commit Message Format

```
feat/fix/improve: [short description]

[Optional longer description — why, not what]

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

Agents commit under the identity configured in their launcher script. Humans use their own git identity. Either way: editorial first line, why-not-what body, trailer.

---

## Files You Should NOT Modify

- `package.json` — don't add dependencies without justification in a ticket's engineering notes.
- `.env.local` — contains secrets, never committed.
- `supabase/config.toml` — managed by the Supabase CLI.
- `.vercel/` — managed by `vercel link`.

---

## Running the suite

```bash
npm run dev          # http://localhost:3000
npm run lint         # ESLint (0 errors required)
npx tsc --noEmit     # TypeScript check
npx vitest run       # unit + AI contract
npm run test:e2e     # Playwright (dev server must be running on :3000)
npm run build        # production build (used by Vercel)
```

The three gating CI checks are `lint`, `unit-tests`, and `e2e-tests` (chromium). Branch protection on `main` blocks merges that don't pass all three. Don't bypass it.
