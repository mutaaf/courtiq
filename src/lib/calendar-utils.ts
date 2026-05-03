import type { Session } from '@/types/database';

const SESSION_TYPE_LABEL: Record<string, string> = {
  practice: 'Practice',
  game: 'Game',
  scrimmage: 'Scrimmage',
  tournament: 'Tournament',
  training: 'Training',
};

const DEFAULT_DURATION_MINUTES = 60;

export function buildCalendarTitle(
  session: Pick<Session, 'type' | 'opponent'>,
  teamName?: string | null,
): string {
  const typeLabel = SESSION_TYPE_LABEL[session.type] ?? session.type;
  const parts: string[] = [typeLabel];
  if (session.opponent) parts.push(`vs ${session.opponent}`);
  if (teamName) parts.push(`— ${teamName}`);
  return parts.join(' ');
}

export function buildCalendarDescription(
  session: Pick<Session, 'type' | 'opponent' | 'location' | 'notes'>,
  teamName?: string | null,
): string {
  const lines: string[] = [];
  if (teamName) lines.push(`Team: ${teamName}`);
  if (session.opponent) lines.push(`Opponent: ${session.opponent}`);
  if (session.location) lines.push(`Location: ${session.location}`);
  lines.push('Powered by SportsIQ');
  return lines.join('\\n');
}

export function parseTime(time: string): { hours: number; minutes: number } | null {
  const match = time.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

export function toICSDateTime(date: string, time: string | null): string {
  const datePart = date.replace(/-/g, '');
  if (!time) return datePart;
  const parsed = parseTime(time);
  if (!parsed) return datePart;
  const hh = String(parsed.hours).padStart(2, '0');
  const mm = String(parsed.minutes).padStart(2, '0');
  return `${datePart}T${hh}${mm}00`;
}

export function addMinutesToDateTime(
  date: string,
  time: string | null,
  minutes: number,
): { date: string; time: string } {
  const parsed = time ? parseTime(time) : null;
  const baseMinutes = parsed ? parsed.hours * 60 + parsed.minutes : 0;
  const totalMinutes = baseMinutes + minutes;
  const newHours = Math.floor(totalMinutes / 60) % 24;
  const newMins = totalMinutes % 60;
  const dayOverflow = Math.floor(totalMinutes / (60 * 24));

  let newDate = date;
  if (dayOverflow > 0) {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + dayOverflow);
    newDate = d.toISOString().split('T')[0];
  }

  return {
    date: newDate,
    time: `${String(newHours).padStart(2, '0')}:${String(newMins).padStart(2, '0')}`,
  };
}

export function getSessionEnd(
  session: Pick<Session, 'date' | 'start_time' | 'end_time'>,
): { date: string; time: string | null } {
  if (session.end_time) {
    return { date: session.date, time: session.end_time };
  }
  if (session.start_time) {
    const result = addMinutesToDateTime(session.date, session.start_time, DEFAULT_DURATION_MINUTES);
    return { date: result.date, time: result.time };
  }
  // All-day event: end date is the next day in ICS spec
  const d = new Date(session.date + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  return { date: d.toISOString().split('T')[0], time: null };
}

export function isAllDaySession(session: Pick<Session, 'start_time'>): boolean {
  return !session.start_time;
}

export function generateICSContent(
  session: Pick<Session, 'id' | 'type' | 'date' | 'start_time' | 'end_time' | 'location' | 'opponent' | 'notes'>,
  teamName?: string | null,
): string {
  const title = buildCalendarTitle(session, teamName);
  const description = buildCalendarDescription(session, teamName);
  const end = getSessionEnd(session);
  const uid = `sportsiq-${session.id}@sportsiq.app`;
  const now = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SportsIQ//SportsIQ//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
  ];

  if (isAllDaySession(session)) {
    lines.push(`DTSTART;VALUE=DATE:${session.date.replace(/-/g, '')}`);
    lines.push(`DTEND;VALUE=DATE:${end.date.replace(/-/g, '')}`);
  } else {
    lines.push(`DTSTART:${toICSDateTime(session.date, session.start_time)}`);
    lines.push(`DTEND:${toICSDateTime(end.date, end.time)}`);
  }

  lines.push(`SUMMARY:${title}`);
  lines.push(`DESCRIPTION:${description}`);
  if (session.location) lines.push(`LOCATION:${session.location}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');

  return lines.join('\r\n');
}

export function buildGoogleCalendarUrl(
  session: Pick<Session, 'type' | 'date' | 'start_time' | 'end_time' | 'location' | 'opponent' | 'notes'>,
  teamName?: string | null,
): string {
  const title = buildCalendarTitle(session, teamName);
  const end = getSessionEnd(session);
  const description = buildCalendarDescription(session, teamName).replace(/\\n/g, '\n');

  let dates: string;
  if (isAllDaySession(session)) {
    dates = `${session.date.replace(/-/g, '')}/${end.date.replace(/-/g, '')}`;
  } else {
    dates = `${toICSDateTime(session.date, session.start_time)}/${toICSDateTime(end.date, end.time)}`;
  }

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates,
    details: description,
  });
  if (session.location) params.set('location', session.location);

  return `https://www.google.com/calendar/render?${params.toString()}`;
}

export function getCalendarFileName(
  session: Pick<Session, 'type' | 'date' | 'opponent'>,
  teamName?: string | null,
): string {
  const title = buildCalendarTitle(session, teamName);
  return title.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.ics';
}

export function downloadICS(
  session: Pick<Session, 'id' | 'type' | 'date' | 'start_time' | 'end_time' | 'location' | 'opponent' | 'notes'>,
  teamName?: string | null,
): void {
  const content = generateICSContent(session, teamName);
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = getCalendarFileName(session, teamName);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function addToCalendar(
  session: Pick<Session, 'id' | 'type' | 'date' | 'start_time' | 'end_time' | 'location' | 'opponent' | 'notes'>,
  teamName?: string | null,
): void {
  try {
    downloadICS(session, teamName);
  } catch {
    window.open(buildGoogleCalendarUrl(session, teamName), '_blank', 'noopener,noreferrer');
  }
}
