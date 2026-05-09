import { describe, it, expect } from 'vitest';
import {
  shouldShowContactForm,
  buildContactFormHeadline,
  buildFormDescription,
  buildContactSuccessText,
  validateContactForm,
  isContactFormReady,
  buildContactApiUrl,
} from '../src/lib/share-parent-contact-utils';

// ─── shouldShowContactForm ─────────────────────────────────────────────────────

describe('shouldShowContactForm', () => {
  it('returns true when parent has no contact on file', () => {
    expect(shouldShowContactForm(false)).toBe(true);
  });
  it('returns false when parent already has contact on file', () => {
    expect(shouldShowContactForm(true)).toBe(false);
  });
});

// ─── buildContactFormHeadline ─────────────────────────────────────────────────

describe('buildContactFormHeadline', () => {
  it('includes coach first name when provided', () => {
    const headline = buildContactFormHeadline('Sarah');
    expect(headline).toContain('Coach Sarah');
  });
  it('falls back to generic "your coach" when no name', () => {
    const headline = buildContactFormHeadline(null);
    expect(headline).toContain('your coach');
    expect(headline).not.toContain('Coach null');
  });
  it('includes "future updates" in the message', () => {
    expect(buildContactFormHeadline('Mike')).toContain('future updates');
  });
});

// ─── buildFormDescription ─────────────────────────────────────────────────────

describe('buildFormDescription', () => {
  it('includes player first name', () => {
    const desc = buildFormDescription('Marcus', 'YMCA Rockets', 'Sarah');
    expect(desc).toContain('Marcus');
  });
  it('includes team name', () => {
    const desc = buildFormDescription('Marcus', 'YMCA Rockets', 'Sarah');
    expect(desc).toContain('YMCA Rockets');
  });
  it('includes coach first name when provided', () => {
    const desc = buildFormDescription('Marcus', 'YMCA Rockets', 'Sarah');
    expect(desc).toContain('Coach Sarah');
  });
  it('falls back to "Your coach" when no coach name', () => {
    const desc = buildFormDescription('Marcus', 'YMCA Rockets', null);
    expect(desc).toContain('Your coach');
  });
  it('mentions WhatsApp or SMS delivery', () => {
    const desc = buildFormDescription('Marcus', 'Team', 'Mike');
    expect(desc.toLowerCase()).toMatch(/whatsapp|sms/);
  });
});

// ─── buildContactSuccessText ──────────────────────────────────────────────────

describe('buildContactSuccessText', () => {
  it('includes player first name', () => {
    const text = buildContactSuccessText('Marcus', 'Sarah');
    expect(text).toContain('Marcus');
  });
  it('includes coach name when provided', () => {
    const text = buildContactSuccessText('Marcus', 'Sarah');
    expect(text).toContain('Coach Sarah');
  });
  it('falls back to generic when no coach name', () => {
    const text = buildContactSuccessText('Marcus', null);
    expect(text).toContain('Your coach');
  });
  it('mentions WhatsApp delivery', () => {
    const text = buildContactSuccessText('Marcus', 'Mike');
    expect(text.toLowerCase()).toContain('whatsapp');
  });
});

// ─── validateContactForm ──────────────────────────────────────────────────────

describe('validateContactForm', () => {
  it('returns error when name is empty', () => {
    expect(validateContactForm('', '4155551234')).toBe('Your name is required.');
  });
  it('returns error when name is whitespace only', () => {
    expect(validateContactForm('   ', '4155551234')).toBe('Your name is required.');
  });
  it('returns error when phone is empty', () => {
    expect(validateContactForm('Mom', '')).not.toBeNull();
  });
  it('returns error when phone is too short', () => {
    expect(validateContactForm('Mom', '123')).not.toBeNull();
  });
  it('returns error when phone is too long', () => {
    expect(validateContactForm('Mom', '1234567890123456')).not.toBeNull();
  });
  it('returns null for valid 10-digit US number', () => {
    expect(validateContactForm('Marcus Mom', '4155551234')).toBeNull();
  });
  it('returns null for valid number with formatting', () => {
    expect(validateContactForm('Marcus Mom', '(415) 555-1234')).toBeNull();
  });
  it('returns null for valid international number', () => {
    expect(validateContactForm('Marcus Mom', '+447911123456')).toBeNull();
  });
});

// ─── isContactFormReady ───────────────────────────────────────────────────────

describe('isContactFormReady', () => {
  it('returns true when name and phone are valid', () => {
    expect(isContactFormReady('Marcus Mom', '4155551234')).toBe(true);
  });
  it('returns false when name is missing', () => {
    expect(isContactFormReady('', '4155551234')).toBe(false);
  });
  it('returns false when phone is missing', () => {
    expect(isContactFormReady('Marcus Mom', '')).toBe(false);
  });
  it('returns false when both are missing', () => {
    expect(isContactFormReady('', '')).toBe(false);
  });
});

// ─── buildContactApiUrl ───────────────────────────────────────────────────────

describe('buildContactApiUrl', () => {
  it('builds the correct API URL', () => {
    const url = buildContactApiUrl('abc123token');
    expect(url).toBe('/api/share/abc123token/parent-contact');
  });
  it('handles tokens with special characters', () => {
    const url = buildContactApiUrl('tok.en_val-ue');
    expect(url).toContain('tok.en_val-ue');
  });
});
