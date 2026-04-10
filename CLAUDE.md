# SportsIQ — Voice-First Coaching Intelligence Platform

## Architecture
- **Next.js 14+ (App Router)** — TypeScript, Tailwind CSS, dark theme (zinc-950)
- **Supabase** — PostgreSQL, Auth, RLS, Storage
- **Offline-first** — Dexie.js/IndexedDB, Service Worker
- **AI** — Claude API via audited wrapper (`src/lib/ai/client.ts`)
- **Voice** — Deepgram Nova-3 + Web Speech API fallback
- **Caching** — React Query + Upstash Redis + materialized tables
- **Config** — System → Org → Team inheritance (`src/lib/config/resolver.ts`)

## Key Patterns
- **Config resolver** — Never hardcode defaults. Use `useConfig()` or `resolveConfigFromDB()`.
- **AI wrapper** — Every AI call goes through `callAI()` or `callAIWithJSON()`. All calls logged to `ai_interactions`.
- **Cache invalidation** — Every write path busts relevant caches via `src/lib/cache/invalidation.ts`.
- **Offline-first** — Save to IndexedDB first, sync to Supabase when online.
- **Tests** — Vitest for unit/integration, Playwright for E2E. 80% coverage floor, 95% for critical paths.

## Commands
- `npm run dev` — Development server
- `npm run test` — Run tests (watch mode)
- `npm run test:unit` — Run unit tests
- `npm run test:e2e` — Run Playwright E2E tests
- `npm run lint` — ESLint
- `npm run typecheck` — TypeScript check
- `npm run build` — Production build

## Project Structure
```
src/app/(auth)/     — Login, signup, onboarding
src/app/(dashboard)/ — Main app pages (roster, capture, plans, etc.)
src/app/api/        — API routes (ai, voice, config, sync, share)
src/app/share/      — Public parent portal (no auth)
src/components/     — UI components, admin, layout, roster, capture
src/lib/            — Core libraries (ai, cache, config, curriculum, sync, voice)
src/hooks/          — React hooks
src/types/          — TypeScript types
supabase/migrations/ — Database schema + seeds
tests/              — Unit, integration, E2E, AI contract tests
```
