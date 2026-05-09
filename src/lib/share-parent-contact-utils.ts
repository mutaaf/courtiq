/**
 * Pure utility functions for the parent contact opt-in form on the share portal.
 * Keeps the component thin and makes the messaging logic testable.
 */

/** True when the coach doesn't yet have the parent's contact info. */
export function shouldShowContactForm(hasParentContact: boolean): boolean {
  return !hasParentContact;
}

/** Headline for the collapsed trigger row. */
export function buildContactFormHeadline(coachFirst: string | null): string {
  const coach = coachFirst ? `Coach ${coachFirst}` : 'your coach';
  return `Get future updates directly from ${coach}`;
}

/** Expanded form description — explains the value to the parent. */
export function buildFormDescription(
  playerFirstName: string,
  teamName: string,
  coachFirst: string | null,
): string {
  const coach = coachFirst ? `Coach ${coachFirst}` : 'Your coach';
  return (
    `${coach} uses SportsIQ to send personalized post-practice updates for ` +
    `${playerFirstName} on ${teamName}. Add your number to receive these directly via WhatsApp or SMS.`
  );
}

/** Success copy shown after the parent saves their contact info. */
export function buildContactSuccessText(
  playerFirstName: string,
  coachFirst: string | null,
): string {
  const coach = coachFirst ? `Coach ${coachFirst}` : 'Your coach';
  return (
    `${coach} can now send you direct updates about ${playerFirstName} via WhatsApp after every practice.`
  );
}

/** Returns an error string if the form is invalid, null otherwise. */
export function validateContactForm(name: string, phone: string): string | null {
  if (!name.trim()) return 'Your name is required.';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) {
    return 'A valid WhatsApp/mobile number is required.';
  }
  return null;
}

/** Whether the submit button should be enabled. */
export function isContactFormReady(name: string, phone: string): boolean {
  return validateContactForm(name, phone) === null;
}

/** Builds the API URL for submitting parent contact info. */
export function buildContactApiUrl(shareToken: string): string {
  return `/api/share/${shareToken}/parent-contact`;
}
