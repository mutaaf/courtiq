# SportsIQ — Voice-First Coaching Intelligence Platform

> AI-powered coaching platform for youth sports. Record observations by voice, track player development, generate practice plans, and share progress with parents.

**Live:** [courtiq-live.vercel.app](https://courtiq-live.vercel.app)
**Repo:** [github.com/mutaaf/courtiq](https://github.com/mutaaf/courtiq)

---

## What It Does

SportsIQ helps volunteer coaches at organizations like YMCA, AAU, and rec leagues become better development coaches through AI:

1. **Voice Capture** — Record observations during practice. AI segments notes into per-player observations with phonetic name matching.
2. **AI Coach Assistant** — Conversational interface for generating plans, drills, reports, and coaching advice.
3. **Skill Tracking** — Curriculum-aligned progression (Exploring → Practicing → Got It! → Game Ready).
4. **Practice Plans** — AI-generated, data-driven plans based on observation history and curriculum.
5. **Parent Portal** — Shareable progress reports with skill progress, coach notes, and growth areas.
6. **Multi-Sport** — Basketball, Flag Football, Soccer (sports-agnostic core).

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14+ (App Router, TypeScript) |
| Database | Supabase (PostgreSQL + Auth + RLS + Storage) |
| AI | Multi-provider: Anthropic Claude, OpenAI GPT-4o, Google Gemini 2.5 Flash |
| Styling | Tailwind CSS (dark/light mode, orange #F97316 accent) |
| State | Zustand + React Query (TanStack Query) |
| Local Storage | Dexie.js (IndexedDB, offline-first) |
| Voice | Web Speech API (live), Gemini (uploaded audio transcription) |
| Caching | Upstash Redis (optional) + React Query client cache |
| Deployment | Vercel (auto-deploy on push to main) |
| CI/CD | GitHub Actions (lint + TypeScript + unit tests + E2E) |
| Testing | Vitest + Testing Library + Playwright |

---

## Project Structure

```
src/
├── app/
│   ├── (auth)/              # Login, signup, onboarding (4 steps)
│   ├── (dashboard)/         # Main app (24 pages)
│   │   ├── admin/           # Coach management, tier control
│   │   ├── analytics/       # Team analytics (pro+)
│   │   ├── assistant/       # AI conversational coach (pro+)
│   │   ├── capture/         # Voice recording + review
│   │   ├── curriculum/      # Skill roadmap
│   │   ├── drills/          # Drill library with detail view
│   │   ├── home/            # Dashboard with Team Pulse
│   │   ├── plans/           # AI practice/game plans
│   │   ├── roster/          # Players + edit + import + photo import
│   │   ├── sessions/        # Practice/game log with media
│   │   └── settings/        # Profile, org, sport, AI keys
│   ├── api/                 # 39 API routes
│   │   ├── ai/              # segment, plan, report-card, assistant, session-debrief
│   │   ├── admin/           # coach management, tier control
│   │   ├── auth/            # callback, setup, create-team, add-players, etc.
│   │   ├── data/            # generic CRUD + mutate (service role bypass)
│   │   ├── media/           # file upload to Supabase storage
│   │   ├── settings/        # AI provider keys
│   │   ├── share/           # parent portal link creation
│   │   └── voice/           # audio upload, transcription
│   ├── demo/                # Zero-barrier try-it (real 20s recording)
│   ├── privacy/             # COPPA compliance page
│   └── share/[token]/       # Public parent report (no auth)
├── components/
│   ├── admin/               # Config editor, audit log, feature flags
│   ├── capture/             # Recording button with pulse animation
│   ├── layout/              # Dashboard shell, team switcher, sync indicator
│   ├── onboarding/          # Welcome tour overlay (5 steps)
│   ├── roster/              # Player card, skill progress bar
│   └── ui/                  # Button, Card, Badge, Input, UpgradeGate, etc.
├── hooks/                   # useActiveTeam, useConfig, useTier, useTheme, etc.
├── lib/
│   ├── ai/                  # Multi-provider client, prompts, schemas, context builder
│   ├── cache/               # Redis client, cache keys, invalidation map
│   ├── config/              # System→Org→Team config resolver
│   ├── curriculum/          # Proficiency scoring algorithm
│   ├── features/            # Feature flag resolver
│   ├── query/               # React Query config + key factory
│   ├── storage/             # IndexedDB (Dexie.js) local database
│   ├── sync/                # Offline→online sync engine
│   ├── voice/               # ASR keyterm builder
│   └── tier.ts              # Tier limits + feature access control
├── types/                   # TypeScript types (database.ts — all 25+ tables)
supabase/
├── migrations/              # 8 SQL migrations (schema, RLS, seeds, flags)
tests/
├── ai/                      # AI output contract tests (Zod schemas)
├── e2e/                     # Playwright E2E (critical paths)
├── factories/               # Test data factories
└── mocks/                   # MSW API mock handlers
```

---

## Tier System

| Feature | Free | Coach ($9.99) | Pro ($24.99) | Organization |
|---------|------|---------------|--------------|-------------|
| Teams | 1 | 3 | Unlimited | Unlimited |
| Sports | 1 | 1 | Unlimited | Unlimited |
| Players/team | 10 | Unlimited | Unlimited | Unlimited |
| AI calls/month | 5 | Unlimited | Unlimited | Unlimited |
| Voice capture | ✓ | ✓ | ✓ | ✓ |
| Practice plans | Basic | Full | Full | Full |
| Report cards | — | ✓ | ✓ | ✓ |
| Parent sharing | — | ✓ | ✓ | ✓ |
| AI Assistant | — | — | ✓ | ✓ |
| Team Analytics | — | — | ✓ | ✓ |
| Media upload | — | — | ✓ | ✓ |
| Multi-coach | — | — | — | ✓ |
| Admin panel | — | — | — | ✓ |
| Custom branding | — | — | — | ✓ |

Enforcement: `src/lib/tier.ts` → `src/hooks/use-tier.ts` → `<UpgradeGate>` → API-level checks.

---

## Key Architecture Patterns

### Data Access (Bypass RLS)
All client-side data goes through `/api/data` and `/api/data/mutate` using service role:
```typescript
import { query, mutate } from '@/lib/api';
const players = await query({ table: 'players', filters: { team_id: id } });
await mutate({ table: 'players', operation: 'insert', data: { name: 'Marcus' } });
```

### AI Client (Multi-Provider)
Auto-resolves provider from org settings → env vars. Every call logged:
```typescript
import { callAI, callAIWithJSON } from '@/lib/ai/client';
// Supports: Anthropic Claude, OpenAI GPT-4o, Google Gemini 2.5 Flash
```

### Config Resolver
System → Org → Team inheritance:
```typescript
const categories = useConfig('sport', 'categories');
// Walks: team override → org override → system default
```

### Feature Gating
```tsx
const { canAccess } = useTier();
<UpgradeGate feature="analytics" featureLabel="Team Analytics">
  <AnalyticsPage />
</UpgradeGate>
```

---

## Setup

```bash
git clone https://github.com/mutaaf/courtiq.git && cd courtiq
npm install
cp .env.local.example .env.local   # Fill in Supabase keys
npm run dev                         # http://localhost:3000
```

AI keys can be set in `.env.local` OR via the UI at Settings → AI & API Keys.

### Database Setup
```bash
npx supabase link --project-ref YOUR_REF
npx supabase db push    # Runs all 8 migrations
```

---

## CI/CD

| Check | Blocking? |
|-------|-----------|
| `npm run lint` — 0 errors | Yes |
| `npx tsc --noEmit` — 0 errors | Yes |
| `npx vitest run` — all pass | Yes |
| Vercel build | Auto on push |

**Innovation Agent:** Hourly automated improvements via Claude Code scheduled trigger.

---

## COPPA Compliance

- Age 13+ confirmation on signup
- No direct minor accounts
- Minimum data collection (name, jersey, position)
- Parent consent notices on contact fields
- Privacy policy at `/privacy`
- Data deletion on request

---

## Contributing

### Before Pushing
```bash
npx tsc --noEmit && npm run lint && npx vitest run
```

### Patterns
- `'use client'` on all dashboard pages
- `query()`/`mutate()` for data (never direct Supabase client)
- `createServiceSupabase()` in API routes
- `useActiveTeam()` for team context
- `useTier()` + `<UpgradeGate>` for feature gating
- Mobile-first (44px+ touch targets)
- Dark theme default (zinc-950 + orange #F97316)

### ESLint
- `no-explicit-any`: off
- `react-hooks/purity`: warn
- `react-hooks/set-state-in-effect`: warn
