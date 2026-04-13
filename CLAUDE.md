# SportsIQ — Voice-First Coaching Intelligence Platform

**Full docs:** See `README.md` for setup, architecture, and tier system.
**Contributing:** See `CONTRIBUTING.md` for priority queue and patterns.

## Quick Reference

### Architecture
- **Next.js 14+ (App Router)** — TypeScript, Tailwind CSS, dark theme (zinc-950), orange accent (#F97316)
- **Supabase** — PostgreSQL + Auth + RLS + Storage (service role for all DB ops)
- **AI** — Multi-provider (Anthropic/OpenAI/Gemini) via `src/lib/ai/client.ts`. Every call logged.
- **Voice** — Web Speech API (live) + Gemini (uploaded audio transcription)
- **Tiers** — Free/Coach/Pro/Organization with `src/lib/tier.ts` + `<UpgradeGate>`
- **COPPA** — Age 13+ on signup, minimum data, `/privacy` page

### Critical Rules
1. **Data access**: Client uses `query()`/`mutate()` from `src/lib/api.ts` — NEVER direct Supabase client
2. **API routes**: Always `createServiceSupabase()` for DB operations (bypasses RLS)
3. **AI calls**: Through `callAI()`/`callAIWithJSON()` — auto-resolves provider, logs everything
4. **Feature gating**: Use `useTier()` hook + `<UpgradeGate>` component
5. **Before pushing**: `npx tsc --noEmit && npm run lint && npx vitest run` — ALL must pass with 0 errors

### Commands
```
npm run dev          # Development server
npm run lint         # ESLint (0 errors required)
npm run typecheck    # TypeScript check
npx vitest run       # Unit + AI contract tests
npm run test:e2e     # Playwright E2E
```

### Key Files
```
src/lib/tier.ts              — Tier limits + feature access
src/lib/ai/client.ts         — Multi-provider AI client
src/lib/ai/prompts.ts        — All AI prompt templates
src/lib/api.ts               — Client query()/mutate() helpers
src/lib/config/resolver.ts   — System→Org→Team config
src/hooks/use-tier.ts        — Client tier hook
src/hooks/use-active-team.ts — Team context hook
src/app/api/data/route.ts    — Generic read endpoint
src/app/api/data/mutate/     — Generic write endpoint
```

### ESLint Config
- `no-explicit-any`: off
- `react-hooks/purity`: warn
- `react-hooks/set-state-in-effect`: warn
- `react-compiler/react-compiler`: off
