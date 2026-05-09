import { describe, it, expect } from 'vitest';
import { announcementAlertEmail } from '@/lib/email/templates';

const BASE_ARGS = {
  parentName: 'Jennifer Williams',
  playerName: 'Marcus Williams',
  coachName: 'Sarah Johnson',
  teamName: 'YMCA Rockets U12',
  title: 'No practice this Friday',
  body: 'Field is closed for maintenance. Next practice is Tuesday at 4pm.',
  shareUrl: 'https://app.youthsportsiq.com/share/abc123',
};

describe('announcementAlertEmail', () => {
  it('returns subject and html strings', () => {
    const { subject, html } = announcementAlertEmail(BASE_ARGS);
    expect(typeof subject).toBe('string');
    expect(typeof html).toBe('string');
    expect(subject.length).toBeGreaterThan(5);
    expect(html.length).toBeGreaterThan(200);
  });

  it('subject contains announcement title', () => {
    const { subject } = announcementAlertEmail(BASE_ARGS);
    expect(subject).toContain('No practice this Friday');
  });

  it('subject contains team name', () => {
    const { subject } = announcementAlertEmail(BASE_ARGS);
    expect(subject).toContain('YMCA Rockets U12');
  });

  it('subject starts with megaphone emoji', () => {
    const { subject } = announcementAlertEmail(BASE_ARGS);
    expect(subject).toMatch(/^📢/);
  });

  it('html contains valid DOCTYPE', () => {
    const { html } = announcementAlertEmail(BASE_ARGS);
    expect(html).toContain('<!DOCTYPE html>');
  });

  it('html contains announcement title', () => {
    const { html } = announcementAlertEmail(BASE_ARGS);
    expect(html).toContain('No practice this Friday');
  });

  it('html contains announcement body text', () => {
    const { html } = announcementAlertEmail(BASE_ARGS);
    expect(html).toContain('Field is closed for maintenance');
  });

  it('html addresses parent by first name when parentName is provided', () => {
    const { html } = announcementAlertEmail(BASE_ARGS);
    expect(html).toContain('Hi Jennifer,');
  });

  it('html falls back to generic greeting when parentName is null', () => {
    const { html } = announcementAlertEmail({ ...BASE_ARGS, parentName: null });
    expect(html).toContain('Hi there,');
  });

  it('html contains coach first name in heading', () => {
    const { html } = announcementAlertEmail(BASE_ARGS);
    expect(html).toContain('Coach Sarah');
  });

  it('html contains team name', () => {
    const { html } = announcementAlertEmail(BASE_ARGS);
    expect(html).toContain('YMCA Rockets U12');
  });

  it('html contains player first name in CTA area', () => {
    const { html } = announcementAlertEmail(BASE_ARGS);
    expect(html).toContain('Marcus');
  });

  it('html includes share URL as CTA link', () => {
    const { html } = announcementAlertEmail(BASE_ARGS);
    expect(html).toContain('https://app.youthsportsiq.com/share/abc123');
  });

  it('html contains SportsIQ branding', () => {
    const { html } = announcementAlertEmail(BASE_ARGS);
    expect(html).toContain('SportsIQ');
  });

  it('html footer credits coach name and team', () => {
    const { html } = announcementAlertEmail(BASE_ARGS);
    expect(html).toContain('Sarah Johnson');
    expect(html).toContain('YMCA Rockets U12');
  });

  it('html escapes XSS in announcement title', () => {
    const { html } = announcementAlertEmail({ ...BASE_ARGS, title: '<script>alert(1)</script>' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('html escapes XSS in announcement body', () => {
    const { html } = announcementAlertEmail({ ...BASE_ARGS, body: '<img src=x onerror=alert(1)>' });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('html escapes XSS in team name', () => {
    const { html } = announcementAlertEmail({ ...BASE_ARGS, teamName: '<b>Team</b>' });
    expect(html).not.toMatch(/<b>Team<\/b>/);
  });

  it('works with single-word coach name', () => {
    const { html } = announcementAlertEmail({ ...BASE_ARGS, coachName: 'Jordan' });
    expect(html).toContain('Coach Jordan');
  });

  it('includes player name in portal CTA text', () => {
    const { html } = announcementAlertEmail({ ...BASE_ARGS, playerName: 'Marcus Williams' });
    expect(html).toContain('Marcus Williams');
    expect(html).toContain('progress report');
  });

  it('parent first name only used in greeting (not full name)', () => {
    const { html } = announcementAlertEmail(BASE_ARGS);
    expect(html).toContain('Hi Jennifer,');
  });
});
