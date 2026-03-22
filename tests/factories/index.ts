import { faker } from '@faker-js/faker';
import type { Player, Observation, ConfigOverride, Coach, Team, Session } from '@/types/database';

function each<T>(fn: (i: number) => T) {
  let counter = 0;
  return () => fn(counter++);
}

function buildFactory<T>(defaults: { [K in keyof T]: T[K] | (() => T[K]) }) {
  return {
    build(overrides: Partial<T> = {}): T {
      const result: any = {};
      for (const [key, value] of Object.entries(defaults)) {
        result[key] = typeof value === 'function' ? (value as () => unknown)() : value;
      }
      return { ...result, ...overrides };
    },
    buildList(count: number, overrides: Partial<T> = {}): T[] {
      return Array.from({ length: count }, () => this.build(overrides));
    },
  };
}

export const coachFactory = buildFactory<Omit<Coach, 'created_at' | 'updated_at'>>({
  id: each(() => faker.string.uuid()),
  org_id: each(() => faker.string.uuid()),
  full_name: each(() => faker.person.fullName()),
  email: each(() => faker.internet.email()),
  avatar_url: null,
  role: 'coach',
  preferences: {},
  onboarding_complete: true,
});

export const teamFactory = buildFactory<Omit<Team, 'created_at' | 'updated_at'>>({
  id: each(() => faker.string.uuid()),
  org_id: each(() => faker.string.uuid()),
  sport_id: each(() => faker.string.uuid()),
  curriculum_id: null,
  name: each(() => `${faker.color.human()} ${faker.animal.bird()}s`),
  age_group: '8-10',
  season: 'Spring 2026',
  season_weeks: 10,
  current_week: 1,
  is_active: true,
  settings: {},
});

export const playerFactory = buildFactory<Omit<Player, 'created_at' | 'updated_at'>>({
  id: each(() => faker.string.uuid()),
  team_id: each(() => faker.string.uuid()),
  name: each(() => faker.person.fullName()),
  nickname: null,
  name_variants: null,
  age_group: '8-10',
  date_of_birth: null,
  position: 'Flex',
  jersey_number: each((i) => i + 1),
  photo_url: null,
  parent_name: null,
  parent_email: null,
  parent_phone: null,
  medical_notes: null,
  notes: null,
  is_active: true,
});

export const observationFactory = buildFactory<Omit<Observation, 'updated_at'>>({
  id: each(() => faker.string.uuid()),
  player_id: each(() => faker.string.uuid()),
  team_id: each(() => faker.string.uuid()),
  coach_id: each(() => faker.string.uuid()),
  session_id: null,
  recording_id: null,
  media_id: null,
  category: 'Offense',
  sentiment: 'positive',
  text: each(() => faker.lorem.sentence()),
  raw_text: null,
  source: 'voice',
  ai_parsed: false,
  coach_edited: false,
  ai_interaction_id: null,
  skill_id: null,
  drill_id: null,
  event_type: null,
  result: null,
  cv_metrics: null,
  cv_failure_tags: null,
  cv_identity_confidence: null,
  video_clip_ref: null,
  audio_annotation: null,
  source_modalities: null,
  local_id: null,
  synced_at: null,
  is_synced: true,
  created_at: new Date().toISOString(),
});

export const sessionFactory = buildFactory<Omit<Session, 'created_at'>>({
  id: each(() => faker.string.uuid()),
  team_id: each(() => faker.string.uuid()),
  coach_id: each(() => faker.string.uuid()),
  type: 'practice',
  date: each(() => faker.date.recent().toISOString().split('T')[0]),
  start_time: null,
  end_time: null,
  location: null,
  opponent: null,
  result: null,
  notes: null,
  planned_drills: null,
  actual_drills: null,
  curriculum_week: null,
  cv_processing_status: 'none',
  cv_source_files: null,
  coach_debrief_text: null,
  coach_debrief_extracts: null,
});

export const configOverrideFactory = buildFactory<Omit<ConfigOverride, 'created_at' | 'updated_at'>>({
  id: each(() => faker.string.uuid()),
  org_id: each(() => faker.string.uuid()),
  team_id: null,
  scope: 'org',
  domain: 'sport',
  key: 'categories',
  value: ['Offense', 'Defense', 'IQ'] as any,
  changed_by: null,
  change_reason: null,
});
