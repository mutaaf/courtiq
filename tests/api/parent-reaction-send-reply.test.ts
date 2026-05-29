/**
 * Ticket 0056 — POST /api/parent-reactions/[reactionId]/send-reply.
 *
 * The route delivers the coach's edited/approved reply via the existing
 * `team_announcements` channel scoped to the one parent of the player on the
 * reaction. AC → tests:
 *   - 401 missing auth.
 *   - 404 wrong-coach (no cross-coach reply).
 *   - 409 already_replied — second POST returns the SAME coach_reply_id
 *     (idempotent stamp).
 *   - 200 happy path: inserts ONE team_announcements row and atomically
 *     stamps parent_reactions.coach_reply_at + coach_reply_id.
 *   - Plant strip: a planted email/phone/URL in the message body is stripped
 *     before the announcement is written (LESSONS#39 — never trust client
 *     input on the way out).
 *   - 429 abuse cap: the 21st same-day reply by the same coach returns 429.
 *   - The recipient is RESOLVED from `players.parent_contact` server-side —
 *     a free-typed `to` in the request body is IGNORED (LESSONS#39).
 *
 * .test.ts NOT .spec.ts (LESSONS#38).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetUser, mockFromFn } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFromFn: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFromFn,
  })),
  createServiceSupabase: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFromFn,
  })),
}));

import { POST, _resetReplyRateLimiterForTest } from '@/app/api/parent-reactions/[reactionId]/send-reply/route';

const COACH_ID = '00000000-0000-4000-a000-000000000001';
const OTHER_COACH = '00000000-0000-4000-a000-0000000000ff';
const REACTION_ID = '00000000-0000-4000-a000-000000000aa1';
const PLAYER_ID = '00000000-0000-4000-a000-000000000030';
const TEAM_ID = '00000000-0000-4000-a000-000000000020';
const ANNOUNCE_ID = '00000000-0000-4000-a000-000000000ce1';

function setAuthUser(id: string | null = COACH_ID) {
  if (id === null) {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  } else {
    mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
  }
}

function makeRequest(body?: unknown, reactionId: string = REACTION_ID) {
  return new Request(`http://localhost/api/parent-reactions/${reactionId}/send-reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? null : JSON.stringify(body),
  });
}

interface ReactionRow {
  id: string;
  coach_id: string;
  team_id: string;
  player_id: string;
  coach_reply_at: string | null;
  coach_reply_id: string | null;
}

interface PlayerRow {
  id: string;
  name: string;
  parent_name: string | null;
  parent_email: string | null;
}

const baseReaction: ReactionRow = {
  id: REACTION_ID,
  coach_id: COACH_ID,
  team_id: TEAM_ID,
  player_id: PLAYER_ID,
  coach_reply_at: null,
  coach_reply_id: null,
};

const basePlayer: PlayerRow = {
  id: PLAYER_ID,
  name: 'Devon Hayes',
  parent_name: 'Sarah',
  parent_email: 'sarah@walker-family.test',
};

interface WiringOptions {
  reaction?: ReactionRow | null;
  player?: PlayerRow | null;
  insertedAnnouncementId?: string;
  capturedAnnouncement?: { row?: Record<string, unknown> };
  capturedReactionUpdate?: { row?: Record<string, unknown> };
}

function wireTables(opts: WiringOptions = {}) {
  const reaction = opts.reaction === undefined ? baseReaction : opts.reaction;
  const player = opts.player === undefined ? basePlayer : opts.player;
  const announcementId = opts.insertedAnnouncementId ?? ANNOUNCE_ID;

  mockFromFn.mockImplementation((table: string) => {
    if (table === 'parent_reactions') {
      // The route reads, then updates, in two calls. Build a stateful chain
      // that handles both: the .select().eq().single() resolves the row; the
      // .update().eq() resolves the write.
      let currentReply = reaction
        ? { coach_reply_at: reaction.coach_reply_at, coach_reply_id: reaction.coach_reply_id }
        : { coach_reply_at: null, coach_reply_id: null };

      const chain: Record<string, unknown> = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockImplementation(() =>
          Promise.resolve({
            data: reaction ? { ...reaction, ...currentReply } : null,
            error: null,
          }),
        ),
        maybeSingle: vi.fn().mockImplementation(() =>
          Promise.resolve({
            data: reaction ? { ...reaction, ...currentReply } : null,
            error: null,
          }),
        ),
        update: vi.fn((row: Record<string, unknown>) => {
          if (opts.capturedReactionUpdate) opts.capturedReactionUpdate.row = row;
          currentReply = {
            coach_reply_at: (row.coach_reply_at as string | null) ?? currentReply.coach_reply_at,
            coach_reply_id: (row.coach_reply_id as string | null) ?? currentReply.coach_reply_id,
          };
          return {
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            then: (resolve: (v: { data: null; error: null }) => unknown) =>
              resolve({ data: null, error: null }),
          };
        }),
      };
      return chain;
    }
    if (table === 'players') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: player, error: null }),
      };
    }
    if (table === 'team_announcements') {
      const chain: Record<string, unknown> = {
        insert: vi.fn((row: Record<string, unknown>) => {
          if (opts.capturedAnnouncement) opts.capturedAnnouncement.row = row;
          return {
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: announcementId },
              error: null,
            }),
          };
        }),
      };
      return chain;
    }
    return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: null }) };
  });
}

describe('POST /api/parent-reactions/[reactionId]/send-reply (ticket 0056)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
    _resetReplyRateLimiterForTest();
    setAuthUser();
  });

  it('returns 401 when there is no authenticated user', async () => {
    setAuthUser(null);
    const res = await POST(makeRequest({ message: 'Thanks Sarah' }), {
      params: Promise.resolve({ reactionId: REACTION_ID }),
    });
    expect(res.status).toBe(401);
    expect(mockFromFn).not.toHaveBeenCalled();
  });

  it('returns 404 when the reaction belongs to a different coach', async () => {
    wireTables({ reaction: { ...baseReaction, coach_id: OTHER_COACH } });
    const res = await POST(makeRequest({ message: 'Thanks Sarah' }), {
      params: Promise.resolve({ reactionId: REACTION_ID }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 409 already_replied on a second send to the same reaction (idempotent id)', async () => {
    wireTables({
      reaction: {
        ...baseReaction,
        coach_reply_at: '2026-05-29T10:00:00.000Z',
        coach_reply_id: ANNOUNCE_ID,
      },
    });
    const res = await POST(makeRequest({ message: 'Thanks Sarah again' }), {
      params: Promise.resolve({ reactionId: REACTION_ID }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error?: string; coach_reply_id?: string };
    expect(body.error).toBe('already_replied');
    expect(body.coach_reply_id).toBe(ANNOUNCE_ID);
  });

  it('happy path: inserts ONE team_announcements row and stamps the reaction', async () => {
    const announcement: { row?: Record<string, unknown> } = {};
    const reactionUpdate: { row?: Record<string, unknown> } = {};
    wireTables({
      capturedAnnouncement: announcement,
      capturedReactionUpdate: reactionUpdate,
    });

    const res = await POST(
      makeRequest({ message: 'Sarah — thanks for the note. Devon has been working hard. — Maya' }),
      { params: Promise.resolve({ reactionId: REACTION_ID }) },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { coach_reply_id?: string };
    expect(body.coach_reply_id).toBe(ANNOUNCE_ID);
    expect(announcement.row).toBeDefined();
    expect(announcement.row?.team_id).toBe(TEAM_ID);
    expect(announcement.row?.created_by).toBe(COACH_ID);
    expect(String(announcement.row?.body)).toContain('Sarah');
    expect(reactionUpdate.row).toBeDefined();
    expect(reactionUpdate.row?.coach_reply_id).toBe(ANNOUNCE_ID);
    expect(reactionUpdate.row?.coach_reply_at).toBeDefined();
  });

  it('strips a planted email / URL / 7+ digit phone from the message body', async () => {
    const announcement: { row?: Record<string, unknown> } = {};
    wireTables({ capturedAnnouncement: announcement });

    await POST(
      makeRequest({
        message:
          'Sarah — text me at maya@gmail.com or call 5558675309. See https://my-site.com. — Maya',
      }),
      { params: Promise.resolve({ reactionId: REACTION_ID }) },
    );

    const body = String(announcement.row?.body ?? '');
    expect(body).not.toContain('maya@gmail.com');
    expect(body).not.toContain('5558675309');
    expect(body).not.toContain('https://my-site.com');
    // But the parent's first name still rides through.
    expect(body).toContain('Sarah');
  });

  it('IGNORES a client-supplied `to` — recipient is server-resolved from players.parent_contact (LESSONS#0039)', async () => {
    const announcement: { row?: Record<string, unknown> } = {};
    wireTables({ capturedAnnouncement: announcement });

    await POST(
      makeRequest({
        message: 'Sarah — thanks. — Maya',
        // A forged client recipient that MUST be ignored.
        to: 'attacker@evil.test',
      }),
      { params: Promise.resolve({ reactionId: REACTION_ID }) },
    );

    // The announcement row itself never carries a "to" field — the channel
    // is team_announcements, scoped to (team_id, body). What we assert is
    // that no part of the persisted row carries the forged value.
    const flat = JSON.stringify(announcement.row);
    expect(flat).not.toContain('attacker@evil.test');
  });

  it('rate-limits the 21st reply within 24h to the same coach (429)', async () => {
    // Allow the first 20 to succeed.
    for (let i = 0; i < 20; i++) {
      const rid = `00000000-0000-4000-a000-000000000a${(0x10 + i).toString(16).padStart(2, '0')}`;
      wireTables({
        reaction: { ...baseReaction, id: rid, coach_reply_at: null, coach_reply_id: null },
        insertedAnnouncementId: `00000000-0000-4000-a000-000000000c${(0xe0 + i).toString(16).padStart(2, '0')}`,
      });
      const ok = await POST(makeRequest({ message: `Thanks ${i}` }, rid), {
        params: Promise.resolve({ reactionId: rid }),
      });
      expect(ok.status).toBe(200);
    }

    // The 21st must be a 429.
    const blockedRid = '00000000-0000-4000-a000-000000000b00';
    wireTables({
      reaction: { ...baseReaction, id: blockedRid },
      insertedAnnouncementId: '00000000-0000-4000-a000-000000000cff',
    });
    const blocked = await POST(makeRequest({ message: 'Thanks 21' }, blockedRid), {
      params: Promise.resolve({ reactionId: blockedRid }),
    });
    expect(blocked.status).toBe(429);
  });
});
