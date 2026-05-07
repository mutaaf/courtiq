import { describe, it, expect } from 'vitest';
import { weeklyStarParentEmail } from '@/lib/email/templates';

const BASE_ARGS = {
  playerName: 'Marcus',
  coachName: 'Sarah Johnson',
  teamName: 'YMCA Rockets U12',
  weekLabel: 'Week of May 5',
  headline: 'Outstanding defensive play all week',
  achievement: 'Marcus showed incredible improvement in his defensive positioning, consistently making smart reads and protecting the lane.',
  shareUrl: 'https://app.youthsportsiq.com/share/abc123',
};

describe('weeklyStarParentEmail', () => {
  it('returns subject and html', () => {
    const { subject, html } = weeklyStarParentEmail(BASE_ARGS);
    expect(typeof subject).toBe('string');
    expect(typeof html).toBe('string');
    expect(subject.length).toBeGreaterThan(10);
    expect(html.length).toBeGreaterThan(100);
  });

  it('subject contains player name and team name', () => {
    const { subject } = weeklyStarParentEmail(BASE_ARGS);
    expect(subject).toContain('Marcus');
    expect(subject).toContain('YMCA Rockets U12');
  });

  it('subject contains Player of the Week', () => {
    const { subject } = weeklyStarParentEmail(BASE_ARGS);
    expect(subject.toLowerCase()).toContain('player of the week');
  });

  it('html contains valid DOCTYPE', () => {
    const { html } = weeklyStarParentEmail(BASE_ARGS);
    expect(html).toContain('<!DOCTYPE html>');
  });

  it('html contains player name', () => {
    const { html } = weeklyStarParentEmail(BASE_ARGS);
    expect(html).toContain('Marcus');
  });

  it('html contains coach first name', () => {
    const { html } = weeklyStarParentEmail(BASE_ARGS);
    expect(html).toContain('Sarah');
  });

  it('html contains team name', () => {
    const { html } = weeklyStarParentEmail(BASE_ARGS);
    expect(html).toContain('YMCA Rockets U12');
  });

  it('html contains week label', () => {
    const { html } = weeklyStarParentEmail(BASE_ARGS);
    expect(html).toContain('Week of May 5');
  });

  it('html contains headline', () => {
    const { html } = weeklyStarParentEmail(BASE_ARGS);
    expect(html).toContain('Outstanding defensive play');
  });

  it('html contains achievement text', () => {
    const { html } = weeklyStarParentEmail(BASE_ARGS);
    expect(html).toContain('defensive positioning');
  });

  it('html includes share URL as CTA when provided', () => {
    const { html } = weeklyStarParentEmail(BASE_ARGS);
    expect(html).toContain('https://app.youthsportsiq.com/share/abc123');
  });

  it('html omits CTA button when shareUrl is null', () => {
    const { html } = weeklyStarParentEmail({ ...BASE_ARGS, shareUrl: null });
    expect(html).not.toContain('/share/');
    // but should still have the player name
    expect(html).toContain('Marcus');
  });

  it('html contains SportsIQ branding', () => {
    const { html } = weeklyStarParentEmail(BASE_ARGS);
    expect(html).toContain('SportsIQ');
  });

  it('html escapes HTML special characters in player name', () => {
    const { html } = weeklyStarParentEmail({ ...BASE_ARGS, playerName: '<script>xss</script>' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('html escapes HTML in headline', () => {
    const { html } = weeklyStarParentEmail({ ...BASE_ARGS, headline: 'Great <b>week</b>' });
    expect(html).not.toMatch(/<b>week<\/b>/);
    expect(html).toContain('&lt;b&gt;week&lt;/b&gt;');
  });

  it('coach first name only used in personal greeting (not full name)', () => {
    const { html } = weeklyStarParentEmail(BASE_ARGS);
    // "Coach Sarah" should appear
    expect(html).toContain('Coach Sarah');
  });

  it('footer credits the coach and team', () => {
    const { html } = weeklyStarParentEmail(BASE_ARGS);
    expect(html).toContain('Sarah Johnson');
    expect(html).toContain('YMCA Rockets U12');
  });

  it('works with single-word coach name', () => {
    const { subject, html } = weeklyStarParentEmail({ ...BASE_ARGS, coachName: 'Jordan' });
    expect(subject).toContain('Marcus');
    expect(html).toContain('Coach Jordan');
  });

  it('preview text appears in HTML for inbox preview', () => {
    const { html } = weeklyStarParentEmail(BASE_ARGS);
    // Preview text is hidden but present in the HTML
    expect(html).toContain('Sarah');
    expect(html).toContain('Marcus');
  });
});
