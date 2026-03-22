import { describe, it, expect } from 'vitest';
import { resolveConfig, getConfigSource } from './resolver';

describe('Config Resolver', () => {
  const systemDefaults = {
    sport: {
      categories: ['Offense', 'Defense', 'IQ', 'Effort', 'Coachability'],
      positions: ['PG', 'SG', 'SF', 'PF', 'C', 'Flex'],
    },
  };

  it('returns system default when no overrides exist', () => {
    const result = resolveConfig({
      domain: 'sport',
      key: 'categories',
      systemDefaults,
      orgOverrides: {},
      teamOverrides: {},
    });
    expect(result).toEqual(systemDefaults.sport.categories);
  });

  it('org override takes precedence over system', () => {
    const orgCats = ['Offense', 'Defense', 'Hustle'];
    const result = resolveConfig({
      domain: 'sport',
      key: 'categories',
      systemDefaults,
      orgOverrides: { 'sport.categories': orgCats },
      teamOverrides: {},
    });
    expect(result).toEqual(orgCats);
  });

  it('team override takes precedence over org', () => {
    const teamCats = ['Offense', 'Defense'];
    const result = resolveConfig({
      domain: 'sport',
      key: 'categories',
      systemDefaults,
      orgOverrides: { 'sport.categories': ['A'] },
      teamOverrides: { 'sport.categories': teamCats },
    });
    expect(result).toEqual(teamCats);
  });

  it('reports correct source for each level', () => {
    expect(
      getConfigSource({
        domain: 'sport',
        key: 'categories',
        systemDefaults,
        orgOverrides: {},
        teamOverrides: {},
      })
    ).toBe('system');

    expect(
      getConfigSource({
        domain: 'sport',
        key: 'categories',
        systemDefaults,
        orgOverrides: { 'sport.categories': ['A'] },
        teamOverrides: {},
      })
    ).toBe('org');

    expect(
      getConfigSource({
        domain: 'sport',
        key: 'categories',
        systemDefaults,
        orgOverrides: { 'sport.categories': ['A'] },
        teamOverrides: { 'sport.categories': ['B'] },
      })
    ).toBe('team');
  });

  it('removing override falls back to system', () => {
    const result = resolveConfig({
      domain: 'sport',
      key: 'categories',
      systemDefaults,
      orgOverrides: {},
      teamOverrides: {},
    });
    expect(result).toEqual(systemDefaults.sport.categories);
  });

  it('handles null override (use default)', () => {
    const result = resolveConfig({
      domain: 'sport',
      key: 'categories',
      systemDefaults,
      orgOverrides: { 'sport.categories': null },
      teamOverrides: {},
    });
    expect(result).toEqual(systemDefaults.sport.categories);
  });

  it('returns null for nonexistent key', () => {
    const result = resolveConfig({
      domain: 'sport',
      key: 'nonexistent',
      systemDefaults,
      orgOverrides: {},
      teamOverrides: {},
    });
    expect(result).toBeNull();
  });
});
