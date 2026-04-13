import { type Page, type BrowserContext } from '@playwright/test';

export const TEST_COACH = {
  id: 'coach-e2e-test-001',
  org_id: 'org-e2e-test-001',
  full_name: 'E2E Test Coach',
  email: 'e2e@test.com',
  role: 'admin',
  preferences: {},
  onboarding_complete: true,
};

export const TEST_TEAM = {
  id: 'team-e2e-test-001',
  org_id: 'org-e2e-test-001',
  sport_id: 'basketball',
  name: 'E2E Test Team',
  age_group: '11-13',
  season: 'Spring 2026',
  season_weeks: 10,
  current_week: 3,
  is_active: true,
  settings: {},
};

export const TEST_PLAYERS = [
  {
    id: 'player-e2e-001',
    team_id: 'team-e2e-test-001',
    name: 'Alice Walker',
    nickname: null,
    name_variants: null,
    jersey_number: 1,
    position: 'Guard',
    is_active: true,
  },
  {
    id: 'player-e2e-002',
    team_id: 'team-e2e-test-001',
    name: 'Bob Carter',
    nickname: 'Bobby',
    name_variants: ['Bobby', 'Bob C.'],
    jersey_number: 5,
    position: 'Forward',
    is_active: true,
  },
];

export const TEST_PLANS = [
  {
    id: 'plan-e2e-001',
    team_id: 'team-e2e-test-001',
    coach_id: 'coach-e2e-test-001',
    type: 'practice',
    title: 'Weekly Practice Plan',
    content: { drills: [], notes: 'Focus on defense' },
    player_id: null,
    created_at: new Date(Date.now() - 86400000).toISOString(),
  },
];

export const TEST_OBSERVATIONS = [
  {
    id: 'obs-e2e-001',
    player_id: 'player-e2e-001',
    team_id: 'team-e2e-test-001',
    coach_id: 'coach-e2e-test-001',
    session_id: null,
    category: 'Defense',
    sentiment: 'positive',
    text: 'Great lateral movement on defense',
    source: 'voice',
    ai_parsed: true,
    created_at: new Date().toISOString(),
  },
];

/** Sign in via the login form using credentials from env vars. */
export async function signInViaUI(page: Page): Promise<boolean> {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;
  if (!email || !password) return false;

  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/\/(home|onboarding)/, { timeout: 10000 });
  return true;
}

/** Save authenticated storage state for reuse across tests. */
export async function saveAuthState(context: BrowserContext, path: string) {
  await context.storageState({ path });
}

/**
 * Mock the /api/me endpoint to return a test coach + team.
 * Call this after auth is established (middleware passes with real cookies).
 */
export async function mockMeEndpoint(page: Page) {
  await page.route('**/api/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ coach: TEST_COACH, teams: [TEST_TEAM] }),
    })
  );
}

/**
 * Mock /api/data (generic read) with sensible defaults.
 * Callers can pass overrides keyed by table name.
 */
export async function mockDataEndpoint(
  page: Page,
  overrides: Record<string, unknown[]> = {}
) {
  await page.route('**/api/data', async (route) => {
    const body = route.request().postDataJSON() as { table?: string };
    const table = body?.table ?? '';
    const data = overrides[table] ?? defaultTableData(table);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data }),
    });
  });
}

/** Mock /api/data/mutate to return success. */
export async function mockMutateEndpoint(page: Page, responseData: unknown[] = []) {
  await page.route('**/api/data/mutate', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: responseData }),
    })
  );
}

function defaultTableData(table: string): unknown[] {
  switch (table) {
    case 'players':
      return TEST_PLAYERS;
    case 'plans':
      return TEST_PLANS;
    case 'observations':
      return TEST_OBSERVATIONS;
    default:
      return [];
  }
}

/** Inject pending_observations into sessionStorage before navigation. */
export async function injectPendingObservations(
  page: Page,
  observations = [
    {
      player_name: 'Alice Walker',
      category: 'Defense',
      sentiment: 'positive',
      text: 'Great lateral movement on defense',
      skill_id: null,
    },
    {
      player_name: 'Bob Carter',
      category: 'Offense',
      sentiment: 'needs-work',
      text: 'Struggled with ball handling under pressure',
      skill_id: null,
    },
  ]
) {
  await page.addInitScript((obs) => {
    sessionStorage.setItem(
      'pending_observations',
      JSON.stringify({
        recording_id: 'rec-e2e-test-001',
        transcript: 'Alice great lateral movement. Bob struggled with ball handling.',
        source: 'voice',
        observations: obs,
        error: null,
        unmatched_names: [],
      })
    );
  }, observations);
}
