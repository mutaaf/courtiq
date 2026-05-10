# Contributing to SportsIQ

## For the Innovation Agent

You run every hour. Here's how to be effective.

### Your Workflow
1. `git pull origin main` — always start fresh
2. Read `CLAUDE.md` for architecture context
3. Read this file for your priority queue
4. Pick an item, implement it, test it, commit it
5. Move on to the next item

### Commit Format
```
feat: add <feature>
fix: resolve <issue>
chore: update <thing>
test: add tests for <feature>
docs: update <file>
```

### Before You Commit
```bash
npx tsc --noEmit    # 0 errors
npm run lint         # 0 errors  
npx vitest run       # all pass
```

---

## Priority Queue

> Items are ordered by impact × effort. Top items = do these first.

### P0 — Do Immediately

#### 1. Fix TypeScript Errors in Existing Code
**Why**: The build fails silently in some paths; CI won't catch regressions.
```bash
npx tsc --noEmit 2>&1 | head -50
```
Fix all errors before adding new features.

#### 2. Add `loading` and `error` States to Every `useEffect` Data Fetch
**Why**: Users see blank screens on slow connections.
**Pattern**:
```tsx
const [data, setData] = useState<T | null>(null);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);

useEffect(() => {
  setLoading(true);
  query('/api/data', { table: 'foo' })
    .then(setData)
    .catch(e => setError(e.message))
    .finally(() => setLoading(false));
}, []);
```

#### 3. Add `<Suspense>` Boundaries Around Route Segments
**Why**: Next.js App Router streaming requires Suspense for partial hydration.
```tsx
// app/dashboard/page.tsx
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export default function Dashboard() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <DashboardContent />
    </Suspense>
  );
}
```

---

### P1 — This Week

#### 4. Implement Optimistic Updates for Common Mutations
**Why**: The app feels slow when every action waits for a server round-trip.
**Files**: `src/lib/api.ts`, any component calling `mutate()`
**Pattern**:
```tsx
// Before mutate(), update local state immediately
setItems(prev => [...prev, optimisticItem]);
try {
  await mutate('/api/data/mutate', { ... });
} catch {
  // Rollback
  setItems(prev => prev.filter(i => i.id !== optimisticItem.id));
}
```

#### ~~5. Add Keyboard Shortcuts for Power Users~~ ✅ Done
**File**: `src/hooks/use-keyboard-shortcuts.ts` — centralised hook wired into dashboard-shell. Shortcuts: Cmd+K (command palette toggle), Cmd+N (new session), Cmd+. (voice capture). All suppressed inside text inputs/textareas.

#### ~~6. Add `robots.txt` and `sitemap.xml`~~ ✅ Done
**Files**: `public/robots.txt`, `src/app/sitemap.ts`

#### ~~7. Implement Rate Limiting on AI Endpoints~~ ✅ Done
**Files**: `src/lib/ai/rate-limit.ts` — sliding-window in-memory limiter with per-endpoint limits. Applied to: segment (20/min), assistant (30/min), plan (10/min), report-card (5/min), session-debrief (10/min). Returns 429 + `Retry-After` header.

#### ~~8. Add `Content-Security-Policy` Header~~ ✅ Done
**File**: `next.config.ts` — X-Frame-Options, X-Content-Type-Options, Referrer-Policy, X-DNS-Prefetch-Control, Permissions-Policy, and CSP applied to all routes. CSP uses permissive `connect-src https: wss:` to cover Supabase/AI APIs without breakage.

---

### P2 — This Sprint

#### ~~9. Add Unit Tests for `src/lib/tier.ts`~~ ✅ Done
**Why**: Tier logic controls billing. Bugs here = revenue loss.
**File**: `src/lib/tier.test.ts` — 46 tests covering TIER_LIMITS structure, canAccess(), getTierLimit(), getAudioLimit() across all 4 tiers.

#### ~~10. Add Unit Tests for AI Prompt Templates~~ ✅ Done
**Why**: Prompt regressions are silent and expensive.
**File**: `src/lib/ai/prompts.test.ts` — 28 tests covering segmentTranscript, practicePlan, gamedaySheet, and sport preamble propagation.

#### ~~11. Implement `useLocalStorage` Hook~~ ✅ Done
**Why**: Persist UI state (collapsed sidebars, selected filters) across sessions.
**Files**: `src/hooks/use-local-storage.ts` + `src/hooks/use-local-storage.test.ts` — 10 tests covering primitives, objects, arrays, invalid JSON fallback, quota error resilience, and SSR guard.

#### ~~12. Add `useDebounce` Hook~~ ✅ Done
**Why**: Search inputs fire an API call on every keystroke.
**Files**: `src/hooks/use-debounce.ts` + `src/hooks/use-debounce.test.ts` — 8 tests covering delay enforcement, timer reset on rapid changes, cleanup on unmount, and edge case of delay=0.

#### 13. Add `aria-label` to All Icon Buttons
**Why**: Accessibility. Screen readers can't describe icon-only buttons.
**Find all violations**:
```bash
grep -r '<button' src/components --include='*.tsx' | grep -v 'aria-label'
```

#### 14. Implement Dark Mode Toggle (If Not Present)
**Why**: The design spec says dark theme, but some users want light mode.
**File**: `src/components/theme-toggle.tsx`
```tsx
'use client';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <button
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      aria-label="Toggle theme"
      className="p-2 rounded-md hover:bg-zinc-800"
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
```

---

### P3 — Backlog

#### 15. Add Storybook for UI Components
**Why**: Visual regression testing + component documentation.
```bash
npx storybook@latest init
```
Add stories for:
- `UpgradeGate`
- All form inputs
- All card components

#### 16. Implement WebSocket for Real-Time Score Updates
**Why**: Coaches need live updates during games without polling.
**Approach**: Supabase Realtime channels
```ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(url, key);

const channel = supabase
  .channel('game-scores')
  .on('postgres_changes', 
    { event: 'UPDATE', schema: 'public', table: 'games' },
    (payload) => {
      console.log('Score updated:', payload.new);
    }
  )
  .subscribe();
```

#### 17. Add Export to PDF Feature
**Why**: Coaches share reports with parents and players.
**Library**: `@react-pdf/renderer`
```bash
npm install @react-pdf/renderer
```
```tsx
import { Document, Page, Text, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { padding: 30 },
  title: { fontSize: 24, marginBottom: 10 },
});

export function SessionReport({ session }) {
  return (
    <Document>
      <Page style={styles.page}>
        <Text style={styles.title}>{session.title}</Text>
        <Text>{session.summary}</Text>
      </Page>
    </Document>
  );
}
```

#### 18. Implement Drill Library with Search
**Why**: Coaches reuse drills across sessions. Manual re-entry wastes time.
**Schema**:
```sql
create table drills (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id),
  name text not null,
  description text,
  sport text,
  tags text[],
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create index drills_org_id_idx on drills(org_id);
create index drills_sport_idx on drills(sport);
create index drills_tags_idx on drills using gin(tags);
```

#### 19. Add Multi-Language Support (i18n)
**Why**: Expansion to Spanish-speaking markets (US Hispanic, Latin America).
**Library**: `next-intl`
```bash
npm install next-intl
```
**Files to create**:
- `messages/en.json`
- `messages/es.json`
- `src/i18n.ts`
- Update `next.config.js` with i18n config

#### 20. Implement CSV Import for Roster
**Why**: Coaches have existing spreadsheets with 50+ players. Manual entry is a blocker.
**File**: `src/components/roster/csv-import.tsx`
```tsx
export function CSVImport({ onImport }: { onImport: (players: Player[]) => void }) {
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const text = await file.text();
    const rows = text.split('\n').slice(1); // skip header
    const players = rows.map(row => {
      const [name, email, position, number] = row.split(',');
      return { name: name.trim(), email: email.trim(), position: position.trim(), number: number.trim() };
    }).filter(p => p.name);
    
    onImport(players);
  };
  
  return (
    <input 
      type="file" 
      accept=".csv"
      onChange={handleFile}
      aria-label="Import players from CSV"
    />
  );
}
```

---

## Architecture Decisions (Read Before Adding Features)

### Why Service Role for All DB Ops?
RLS policies are complex and hard to test. We bypass them at the API layer and enforce access control in TypeScript. This is intentional.

### Why Multi-Provider AI?
Anthropic for reasoning, OpenAI for embeddings, Gemini for audio. Each has strengths. `callAI()` handles the routing.

### Why `query()`/`mutate()` Instead of Direct Supabase?
Single choke point for:
- Auth token injection
- Request deduplication
- Error normalization
- Future: offline queue, optimistic updates

### Why Tier Checks in Two Places?
- **Client** (`useTier()` + `<UpgradeGate>`): UX — hide features before the user even tries
- **Server** (API routes): Security — prevent API abuse regardless of UI

Both are required. Never only one.

### Why No Redux/Zustand?
Server state lives in React Query (or SWR). UI state is local. We don't have complex client-side state that warrants a global store.

---

## Code Patterns

### API Route Pattern
```ts
// app/api/something/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/service';
import { getAuthenticatedUser } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from('table')
    .select('*')
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
```

### Component Pattern
```tsx
// src/components/feature/feature-card.tsx
'use client';

import { useState } from 'react';
import { UpgradeGate } from '@/components/upgrade-gate';
import { useTier } from '@/hooks/use-tier';
import { query } from '@/lib/api';

interface FeatureCardProps {
  sessionId: string;
}

export function FeatureCard({ sessionId }: FeatureCardProps) {
  const { tier, canAccess } = useTier();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  if (!canAccess('feature_name')) {
    return <UpgradeGate feature="Feature Name" requiredTier="pro" />;
  }

  return (
    <div className="bg-zinc-900 rounded-lg p-4">
      {/* content */}
    </div>
  );
}
```

### AI Call Pattern
```ts
import { callAIWithJSON } from '@/lib/ai/client';

const result = await callAIWithJSON({
  prompt: buildSomePrompt(context),
  schema: z.object({
    recommendation: z.string(),
    confidence: z.number().min(0).max(1),
    drills: z.array(z.string()),
  }),
  userId: user.id,
  feature: 'coaching_recommendation',
});
```

---

## Files You Should NOT Modify
- `package.json` (don't add dependencies without good reason)
- `.env.local` (contains secrets)
- `supabase/config.toml`
- `.vercel/` directory
