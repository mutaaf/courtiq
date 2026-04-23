// Birthday utility functions for player birthday tracking and parent messaging.
// All functions are pure and injectable-date for testability.

export interface BirthdayPlayer {
  id: string;
  name: string;
  date_of_birth: string | null;
  parent_name: string | null;
  parent_phone: string | null;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

/** Returns true if a YYYY-MM-DD string is a parseable date. */
export function isValidDob(dob: string): boolean {
  if (!dob || typeof dob !== 'string') return false;
  const match = dob.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** Extracts { month, day } from a YYYY-MM-DD string, 1-based. Returns null if invalid. */
export function parseDobMonthDay(dob: string): { month: number; day: number } | null {
  if (!isValidDob(dob)) return null;
  const [, , m, d] = dob.match(/^(\d{4})-(\d{2})-(\d{2})$/)!.map(Number);
  return { month: m, day: d };
}

/** Returns true if the player has a valid date_of_birth set. */
export function hasDob(player: BirthdayPlayer): boolean {
  return !!player.date_of_birth && isValidDob(player.date_of_birth);
}

/** Filters a player list to only those with a valid DOB. */
export function playersWithDob(players: BirthdayPlayer[]): BirthdayPlayer[] {
  return players.filter(hasDob);
}

// ─── Birthday logic ───────────────────────────────────────────────────────────

/**
 * Returns the number of days until the player's next birthday from `today`.
 * Returns 0 if today IS the birthday.
 * Returns 365 (or 366 in a leap year) if dob is invalid or missing.
 */
export function getDaysUntilBirthday(dob: string, today: Date = new Date()): number {
  const md = parseDobMonthDay(dob);
  if (!md) return 365;

  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth() + 1; // 1-based
  const todayDay = today.getDate();

  // Candidate: birthday this year
  let bdYear = todayYear;
  let candidate = new Date(bdYear, md.month - 1, md.day);

  // If the birthday this year is before today, move to next year
  const todayNorm = new Date(todayYear, todayMonth - 1, todayDay);
  if (candidate < todayNorm) {
    bdYear = todayYear + 1;
    candidate = new Date(bdYear, md.month - 1, md.day);
  }

  const msPerDay = 86_400_000;
  return Math.round((candidate.getTime() - todayNorm.getTime()) / msPerDay);
}

/** Returns true if today is the player's birthday. */
export function isBirthdayToday(dob: string, today: Date = new Date()): boolean {
  return getDaysUntilBirthday(dob, today) === 0;
}

/** Returns true if the birthday falls within the next `withinDays` days (inclusive of today). */
export function isBirthdaySoon(dob: string, withinDays: number, today: Date = new Date()): boolean {
  return getDaysUntilBirthday(dob, today) <= withinDays;
}

/**
 * Returns the age the player will turn on their upcoming birthday.
 * Returns null if DOB is invalid or if birth year makes no sense.
 */
export function getAgeThisBirthday(dob: string, today: Date = new Date()): number | null {
  if (!isValidDob(dob)) return null;
  const birthYear = parseInt(dob.split('-')[0], 10);
  if (isNaN(birthYear)) return null;
  const md = parseDobMonthDay(dob);
  if (!md) return null;
  const todayYear = today.getFullYear();
  const todayNorm = new Date(todayYear, today.getMonth(), today.getDate());
  const thisYearBirthday = new Date(todayYear, md.month - 1, md.day);
  const nextBirthdayYear = thisYearBirthday >= todayNorm ? todayYear : todayYear + 1;
  const age = nextBirthdayYear - birthYear;
  if (age < 1 || age > 100) return null;
  return age;
}

// ─── Filtering ────────────────────────────────────────────────────────────────

/** Returns players whose birthday is exactly today. */
export function filterBirthdaysToday(
  players: BirthdayPlayer[],
  today: Date = new Date()
): BirthdayPlayer[] {
  return players.filter(
    (p) => p.date_of_birth && isBirthdayToday(p.date_of_birth, today)
  );
}

/** Returns players with a birthday in the next `days` days, NOT including today. */
export function filterUpcomingBirthdays(
  players: BirthdayPlayer[],
  days: number,
  today: Date = new Date()
): BirthdayPlayer[] {
  return players.filter((p) => {
    if (!p.date_of_birth) return false;
    const d = getDaysUntilBirthday(p.date_of_birth, today);
    return d > 0 && d <= days;
  });
}

/** Returns players with a birthday today OR within the next `days` days. */
export function filterAllUpcomingBirthdays(
  players: BirthdayPlayer[],
  days: number,
  today: Date = new Date()
): BirthdayPlayer[] {
  return players.filter(
    (p) => p.date_of_birth && isBirthdaySoon(p.date_of_birth, days, today)
  );
}

/** Returns true if any player has a birthday today or within `days` days. */
export function hasUpcomingBirthdays(
  players: BirthdayPlayer[],
  days: number,
  today: Date = new Date()
): boolean {
  return filterAllUpcomingBirthdays(players, days, today).length > 0;
}

/** Counts players with birthday today. */
export function countBirthdaysToday(players: BirthdayPlayer[], today: Date = new Date()): number {
  return filterBirthdaysToday(players, today).length;
}

/** Counts players with birthday within next `days` days (not including today). */
export function countUpcomingBirthdays(
  players: BirthdayPlayer[],
  days: number,
  today: Date = new Date()
): number {
  return filterUpcomingBirthdays(players, days, today).length;
}

// ─── Sorting ──────────────────────────────────────────────────────────────────

/** Sorts players by soonest birthday first. Players without DOB go to the end. */
export function sortByUpcomingBirthday(
  players: BirthdayPlayer[],
  today: Date = new Date()
): BirthdayPlayer[] {
  return [...players].sort((a, b) => {
    const da = a.date_of_birth ? getDaysUntilBirthday(a.date_of_birth, today) : 9999;
    const db = b.date_of_birth ? getDaysUntilBirthday(b.date_of_birth, today) : 9999;
    return da - db;
  });
}

// ─── Display formatting ───────────────────────────────────────────────────────

/**
 * Returns a human-readable label for when the birthday is.
 * Examples: "Today!", "Tomorrow", "in 3 days", "Dec 5"
 */
export function formatBirthdayLabel(dob: string, today: Date = new Date()): string {
  const days = getDaysUntilBirthday(dob, today);
  if (days === 0) return 'Today!';
  if (days === 1) return 'Tomorrow';
  if (days <= 6) return `in ${days} days`;
  const md = parseDobMonthDay(dob);
  if (!md) return '';
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${MONTHS[md.month - 1]} ${md.day}`;
}

// ─── Messaging ────────────────────────────────────────────────────────────────

/**
 * Builds a warm, coach-sent birthday message for a parent.
 * Includes age if known.
 */
export function buildBirthdayMessage(
  playerName: string,
  age: number | null,
  teamName: string
): string {
  const ageText = age !== null ? `, who turns ${age} today,` : '';
  return `Hi! Just wanted to wish ${playerName}${ageText} a very happy birthday from ${teamName}! 🎂🎉 We're so lucky to have them on the team. Have a wonderful celebration!`;
}

/** Builds the share text for clipboard copy (same message, no URL). */
export function buildBirthdayShareText(
  playerName: string,
  age: number | null,
  teamName: string
): string {
  return buildBirthdayMessage(playerName, age, teamName);
}

/** Builds a WhatsApp-formatted URL for a pre-filled message. */
export function buildWhatsAppUrl(phone: string, message: string): string {
  // Strip all non-digit characters from phone
  const digits = phone.replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/**
 * Returns a WhatsApp URL for a player's parent, or null if no parent_phone.
 */
export function buildBirthdayWhatsAppUrl(
  player: BirthdayPlayer,
  teamName: string,
  today: Date = new Date()
): string | null {
  if (!player.parent_phone) return null;
  if (!player.date_of_birth) return null;
  const age = getAgeThisBirthday(player.date_of_birth, today);
  const message = buildBirthdayMessage(player.name, age, teamName);
  return buildWhatsAppUrl(player.parent_phone, message);
}

// ─── localStorage key ─────────────────────────────────────────────────────────

/**
 * Returns the localStorage key used to dismiss the birthday card for a team+day.
 * Format: "birthday-dismiss:[teamId]:[YYYY-MM-DD]"
 */
export function getBirthdayDismissKey(teamId: string, today: Date = new Date()): string {
  const dateStr = today.toISOString().split('T')[0];
  return `birthday-dismiss:${teamId}:${dateStr}`;
}
