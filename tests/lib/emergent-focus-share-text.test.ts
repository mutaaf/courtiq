/**
 * Ticket 0071 — pure share-text template the director taps "Copy" on.
 *
 * The text is a template-fill (no AI), instructed POSITIVELY per LESSONS#0023
 * (no enumerated banned-word list inside the prompt body — these are the
 * AGENTS.md banned words: "journey", "amazing", "exciting", "elevate",
 * "empower", "synergy", "unlock your potential").
 *
 * .test.ts (NOT .spec.ts) — per docs/LESSONS.md.
 */
import { describe, it, expect } from 'vitest';
import { buildEmergentFocusShareText } from '@/lib/emergent-focus-share-text';

const BANNED = [
  /journey/i,
  /amazing/i,
  /exciting/i,
  /elevate/i,
  /empower/i,
  /synergy/i,
  /unlock your potential/i,
];

describe('buildEmergentFocusShareText (ticket 0071) — template-fill', () => {
  // (i) 3 teams → "Nice — 3 of you converged on closeouts independently this
  //              week (Hawks U10, Sharks U12, Eagles U14). Keep at it."
  it('renders the canonical 3-team line', () => {
    const text = buildEmergentFocusShareText({
      skill: 'closeouts',
      teamCount: 3,
      teamNames: ['Hawks U10', 'Sharks U12', 'Eagles U14'],
    });
    expect(text).toBe(
      'Nice — 3 of you converged on closeouts independently this week (Hawks U10, Sharks U12, Eagles U14). Keep at it.'
    );
  });

  // (ii) 5 teams → "+ 2 more" after the first 3 names.
  it('truncates after the first 3 team names with "+ N more"', () => {
    const text = buildEmergentFocusShareText({
      skill: 'closeouts',
      teamCount: 5,
      teamNames: ['Hawks U10', 'Sharks U12', 'Eagles U14', 'Wolves U10', 'Bears U16'],
    });
    expect(text).toContain('Hawks U10, Sharks U12, Eagles U14 + 2 more');
    expect(text).toContain('5 of you converged on closeouts');
    expect(text).toContain('Keep at it.');
  });

  it('handles exactly 3 teams with NO "+ N more" suffix', () => {
    const text = buildEmergentFocusShareText({
      skill: 'closeouts',
      teamCount: 3,
      teamNames: ['Hawks U10', 'Sharks U12', 'Eagles U14'],
    });
    expect(text).not.toContain('more');
  });

  it('handles exactly 4 teams with "+ 1 more"', () => {
    const text = buildEmergentFocusShareText({
      skill: 'spacing',
      teamCount: 4,
      teamNames: ['Hawks U10', 'Sharks U12', 'Eagles U14', 'Wolves U10'],
    });
    expect(text).toContain('+ 1 more');
  });

  // (iii) the output contains no banned word for a matrix of fixtures.
  it('contains no AGENTS.md banned word for a matrix of skill / team-name fixtures', () => {
    const matrix: Array<{ skill: string; teamCount: number; teamNames: string[] }> = [
      { skill: 'closeouts', teamCount: 3, teamNames: ['Hawks U10', 'Sharks U12', 'Eagles U14'] },
      { skill: 'spacing & off-ball movement', teamCount: 4, teamNames: ['Wolves U10', 'Bears U16', 'Lions U18', 'Foxes U12'] },
      { skill: 'boxing out', teamCount: 6, teamNames: ['A', 'B', 'C', 'D', 'E', 'F'] },
      { skill: 'transition defense', teamCount: 3, teamNames: ['U10 Sun', 'U12 Moon', 'U14 Star'] },
    ];
    for (const fixture of matrix) {
      const text = buildEmergentFocusShareText(fixture);
      for (const banned of BANNED) {
        expect(text, `banned word ${banned} matched for ${fixture.skill}`).not.toMatch(banned);
      }
      // Positive voice: "Nice" + "Keep at it." appear in every output.
      expect(text).toMatch(/^Nice — /);
      expect(text.trimEnd()).toMatch(/Keep at it\.$/);
    }
  });
});
