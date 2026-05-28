/**
 * Ticket 0054 — pure helpers for the vanity-URL flow.
 *
 *   proposeHandle(displayName, takenHandles) -> string
 *   isReservedHandle(handle) -> boolean
 *   isValidHandleShape(handle) -> boolean
 *
 * No database access; these are deterministic transforms. The shape regex is
 * the SAME character class the migration's CHECK constraint enforces — that
 * cross-check is asserted in tests/migrations/coaches-handle.test.ts.
 *
 * .test.ts NOT .spec.ts (LESSONS#38).
 */
import { describe, it, expect } from 'vitest';
import {
  proposeHandle,
  isReservedHandle,
  isValidHandleShape,
  RESERVED_HANDLES,
} from '@/lib/coach-handle-utils';

describe('proposeHandle()', () => {
  it('kebab-cases a two-word display name', () => {
    expect(proposeHandle('Sarah Rodriguez', new Set())).toBe('sarah-rodriguez');
  });

  it('lowercases a single name', () => {
    expect(proposeHandle('Maria', new Set())).toBe('maria');
  });

  it('strips non-alphanumeric characters and collapses spaces to hyphens', () => {
    expect(proposeHandle("D'Angelo Russell", new Set())).toBe('dangelo-russell');
    expect(proposeHandle('Anne-Marie O’Brien', new Set())).toBe('anne-marie-obrien');
  });

  it('collapses repeated whitespace + hyphens into single hyphens', () => {
    expect(proposeHandle('Sarah   Rodriguez', new Set())).toBe('sarah-rodriguez');
    expect(proposeHandle('Sarah---Rodriguez', new Set())).toBe('sarah-rodriguez');
  });

  it('trims leading and trailing hyphens', () => {
    expect(proposeHandle('-Sarah Rodriguez-', new Set())).toBe('sarah-rodriguez');
    expect(proposeHandle('!!Sarah!!', new Set())).toBe('sarah');
  });

  it('caps the result at 32 characters', () => {
    const result = proposeHandle('A'.repeat(40) + ' ' + 'B'.repeat(40), new Set());
    expect(result.length).toBeLessThanOrEqual(32);
    expect(/^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(result)).toBe(true);
  });

  it('appends -2, -3, ... when the primary is taken', () => {
    const taken = new Set(['sarah-rodriguez']);
    expect(proposeHandle('Sarah Rodriguez', taken)).toBe('sarah-rodriguez-2');
    taken.add('sarah-rodriguez-2');
    expect(proposeHandle('Sarah Rodriguez', taken)).toBe('sarah-rodriguez-3');
  });

  it('avoids reserved handles too', () => {
    expect(proposeHandle('Admin', new Set())).toBe('admin-2');
  });

  it('falls back to a deterministic suffix when the input collapses to an empty string', () => {
    // All-special-char input collapses to nothing — propose a safe placeholder.
    const result = proposeHandle('!!!', new Set());
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(isValidHandleShape(result)).toBe(true);
  });
});

describe('isReservedHandle()', () => {
  // Every reserved prefix the route protects. A coach must not be able to
  // claim a handle that collides with an existing /coach/<prefix> sub-route or
  // a top-level app route segment.
  const required = [
    'admin',
    'api',
    'app',
    'settings',
    'signup',
    'login',
    'share',
    'team-card',
    'season-recap',
    'plan',
    'recap',
    'programs',
    'coach',
    'parents',
    'observe',
    'org',
    'privacy',
    'terms',
    'account',
  ];

  it.each(required)('reserves "%s"', (h) => {
    expect(isReservedHandle(h)).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isReservedHandle('Admin')).toBe(true);
    expect(isReservedHandle('SHARE')).toBe(true);
  });

  it('does not reserve a normal handle', () => {
    expect(isReservedHandle('sarah-rodriguez')).toBe(false);
  });

  it('exports the canonical reserved set', () => {
    for (const h of required) {
      expect(RESERVED_HANDLES.has(h)).toBe(true);
    }
  });
});

describe('isValidHandleShape()', () => {
  it.each([
    'sr',
    'sarah-rodriguez',
    'sarah-rodriguez-2',
    'coach2026',
    'a-b',
    'a'.repeat(32),
  ])('accepts %s', (h) => {
    expect(isValidHandleShape(h)).toBe(true);
  });

  it.each([
    '',
    'a',
    '-leading',
    'trailing-',
    'A-uppercase',
    'spaces here',
    'has_underscore',
    'has.dot',
    'has/slash',
    'a'.repeat(33),
  ])('rejects %s', (h) => {
    expect(isValidHandleShape(h)).toBe(false);
  });
});
