---
id: 0013
title: Give the Player-of-the-Week spotlight its own rich link preview when a parent forwards the portal
status: in-progress
priority: P2
area: parent-portal
created: 2026-05-21
owner: implementation-dev
---

## User story

As a parent who just opened my kid's portal and saw "Player of the Week — owned the
defensive boards all night," I want the link to look like THAT when I forward it to the
team group chat, so that what shows up in the chat is the celebratory spotlight — the thing
people screenshot — not a generic "Progress Report" card that buries the moment.

## Why now (four lenses)

### Product Owner
Ticket 0009 shipped the weekly-star / player-of-match spotlight onto the parent portal and
into `/api/share/[token]` as `playerSpotlight`. But the link PREVIEW — the OG image that
renders in iMessage/WhatsApp/Slack when the link is pasted — is still the generic
"Season Story / Progress Report" card (`src/app/share/[token]/opengraph-image.tsx` +
`generateMetadata` in `page.tsx`). The single most forward-worthy artifact we make never
appears in the preview that decides whether anyone taps. The smallest meaningful unit of
value: when a player HAS a recent spotlight, render a spotlight-styled OG image (the kid's
name + "Player of the Week" + the headline) and set the OG title/description to match — and
fall back to today's generic card when there's no spotlight. The data already exists on the
share response; this is presentation only.

### Stakeholder
This sharpens the parent-portal viral loop precisely where it converts: the link preview is
the conversion surface for the forward. We already pay to generate the spotlight (an AI call)
and already surface it on the portal; not putting it in the preview wastes the most affecting
asset at the exact moment a third party decides to engage. It deepens the structured-artifact
moat by making the artifact's *distribution* as good as its content. No new data, no new AI
call, no schema change — it reuses `playerSpotlight` from the 0009 share contract.

### User (the parent forwarding on Saturday — and the parent receiving it)
The parent taps share. In the group chat, instead of a flat "Progress Report" rectangle,
the preview shows their kid's name under "PLAYER OF THE WEEK" with the real coach headline —
on the dark SportsIQ card. Other parents see a teammate being celebrated by name and tap. The
forwarding parent does nothing extra; they just got a better-looking forward. If for any
reason the spotlight data is missing or the image renderer hiccups, the existing generic card
renders — the preview must never break the link.

### Growth
This is the "show me" moment upgraded to the surface that actually spreads it. The screenshot
that makes another parent (and the next coach) say "wait, what is that?" is a named kid under
"Player of the Week" — and the link preview is where that lands without anyone opening
anything. It compounds 0009 (the spotlight on the portal) and 0011 (the referral-attributed
forward): a better preview means more taps, more opens, more forwards, more attributed
signups. It's the cheapest possible multiplier on an asset we already produce.

## Acceptance criteria

Each box maps 1:1 to a vitest or Playwright test scenario.

- [ ] When the share response has a non-null `playerSpotlight`, `generateMetadata` in `src/app/share/[token]/page.tsx` sets an OG title containing "Player of the Week" (or "Player of the Match" when the spotlight is a `player_of_match` shape) and a description containing the spotlight `headline` (vitest/unit on the metadata builder, or a Playwright `<meta property="og:title">` assertion).
- [ ] When the share response has `playerSpotlight: null`, `generateMetadata` returns today's generic "Progress Report" title/description unchanged (regression — the existing preview still works for players without a spotlight).
- [ ] The OG image route (`src/app/share/[token]/opengraph-image.tsx`) renders a spotlight variant (player first name + a "PLAYER OF THE WEEK"/"PLAYER OF THE MATCH" label + the spotlight headline) when `playerSpotlight` is present, and the existing generic Season-Story image when it is absent (a render-path test: assert the image route returns a 200 image response for both the spotlight and no-spotlight token without throwing).
- [ ] The OG image route degrades safely: if the share fetch fails or `playerSpotlight` is malformed, it still returns the generic image (no unhandled throw, no 500) — assert it returns a valid `ImageResponse` for a token whose data is missing.
- [ ] The spotlight OG card distinguishes the two artifact shapes: it uses the `weekly_star` fields (`headline`) vs `player_of_match` fields (`headline`, and the presence of `session_label` picks the "Match" label) defensively, mirroring how the portal card in 0009 already disambiguates them (unit test on the shape-picking helper).
- [ ] COPPA/privacy: the spotlight OG card renders ONLY the player's FIRST name + the coach-authored headline/achievement text — no last name, no jersey, no roster, no other minor's data (the same minimization the portal already applies). Assert the render input is limited to first-name + spotlight text fields.
- [ ] Regression: the portal page itself (`/share/[token]`) and the existing spotlight card from 0009 are unchanged — this ticket touches only the link-preview/OG layer.

## Out of scope

- Generating or changing the weekly-star / player-of-match artifacts (those routes are unchanged; 0009 already wired `player_id` and the portal card).
- Adding `playerSpotlight` to the share response (already present from 0009).
- A bespoke OG-image templating system or per-artifact image designer. One conditional branch inside the existing `opengraph-image.tsx` (spotlight vs generic) is the whole v1.
- Animated/dynamic previews, video, or carousel previews. Single static 1200×630 PNG, same as today.
- Changing the in-portal spotlight card design from 0009.
- A separate OG variant for any other artifact (team personality already has its own card from 0010; report cards, season summaries, etc. are future tickets if this performs).
- Twitter/X-specific card tuning beyond reusing the existing `twitter` summary_large_image block with the new title/description.

## Engineering notes

- `src/app/share/[token]/page.tsx` `generateMetadata` (~lines 312–373) — `getShareData()` already returns `playerSpotlight` (added in 0009). Branch on it: when present, build the spotlight title/description; else keep the current generic title/description. The `ogImageUrl` (`${appUrl}/share/${token}/opengraph-image`) is unchanged — the image route reads the same share data and self-selects its variant.
- `src/app/share/[token]/opengraph-image.tsx` — `getSharePreviewData()` already fetches `/api/share/[token]`, which now includes `playerSpotlight`. Add a conditional render branch: if `playerSpotlight` is present, render the spotlight layout (reuse the existing dark `#09090b` + `#F97316` styling, the SPORTSIQ wordmark, and the orange accent stripe; swap the headline block for "PLAYER OF THE WEEK"/"PLAYER OF THE MATCH" + first name + spotlight `headline`). Else render the existing Season-Story layout untouched. Keep `runtime = 'nodejs'` and the 1200×630 size.
- Shape disambiguation: the weekly-star and player-of-match `content_structured` shapes differ slightly (player-of-match carries `session_label`/`coach_message`; weekly-star carries `coach_shoutout`). 0009's portal card already disambiguates by `session_label` presence — extract or mirror that tiny helper (e.g. `isMatchSpotlight(spotlight)`) so the OG card and the metadata builder agree on the label. Render only `headline` (+ optionally `achievement`) for the image; do not render coach shoutout PII-adjacent free text beyond the headline if it could include another player's name — keep it to the spotlight subject's first name + headline.
- COPPA: render the player FIRST name only (`name.split(' ')[0]`, as both the page and the OG route already do) and the coach-authored headline. No last name, jersey, or roster on the public preview (AGENTS.md data-minimization).
- `tests/` — `tests/share/spotlight-og.test.ts` (`.test.ts`, NOT `.spec.ts` — LESSONS.md): unit-test the metadata title/description branching (spotlight present → "Player of the Week"/"Match" + headline; absent → generic) and the `isMatchSpotlight` helper. For the image route, assert it returns a 200 `ImageResponse` for spotlight, no-spotlight, and missing-data tokens (no throw) — `ImageResponse` is renderable in Node; assert status/contentType rather than pixel content.
- `tests/e2e/share-flow.spec.ts` (0006-seeded) — the seed already has a `player_of_match` plan for one player (added in 0009) and a no-spotlight player; add `<meta property="og:title">` assertions for both via a request to the page head, or assert the spotlight token's OG title contains "Player of the Match" and the other contains "Progress Report".
- New deps: no. Migration: no. Env vars: no (`NEXT_PUBLIC_APP_URL` already used). AI prompt change: no. Tier feature key: no — the spotlight already inherits the Coach+ `parent_sharing` gate by living on the share portal (0009); the preview adds no new gate.

## Implementation log

(Appended by the implementation-dev agent during execution.)

- 2026-05-21 — branch `feat/0013-spotlight-og-card-for-share-preview` opened; ticket flipped to `in-progress` (frontmatter + README index row) in the first commit.
- 2026-05-21 — failing test added in `tests/share/spotlight-og.test.ts` (`.test.ts`, per LESSONS) — `isMatchSpotlight`, `buildSpotlightPreview` (COPPA: first-name + headline only), `buildShareMetadata` title/description branching, and OG-image render-path (200 ImageResponse for spotlight / no-spotlight / missing-data / throwing / malformed, `next/og` mocked). Confirmed it failed first for the right reason (`@/lib/share-metadata` + spotlight helpers absent).
- 2026-05-21 — implemented: extracted pure `buildShareMetadata` into `src/lib/share-metadata.ts` (page.tsx `generateMetadata` delegates; generic path byte-identical), added `isMatchSpotlight` + `buildSpotlightPreview` to `src/lib/player-spotlight-utils.ts`, and one spotlight-vs-generic branch in `opengraph-image.tsx` (reuses the dark #09090b + #F97316 chrome, SPORTSIQ wordmark, accent stripe; `runtime='nodejs'`, 1200×630). Extended `tests/e2e/share-flow.spec.ts` with `<meta property="og:title">` assertions for both seeded tokens.
- 2026-05-21 — local gate: `npm run lint` 0 errors, `npx tsc --noEmit` 0 errors, full `npx vitest run --no-file-parallelism` = 4040 passed / 1 failed; the lone fail is the pre-existing known-environmental TZ off-by-one in `tests/player-of-match-utils.test.ts` (LESSONS: `Apr 27` vs `Apr 28`), untouched by this ticket. e2e arbitrated by CI's seeded `e2e-tests` (no local Supabase; the OG-meta assertions only resolve against the seed per LESSONS ship/0009).
- YYYY-MM-DD — PR #N opened, CI [state]
- YYYY-MM-DD — merged to main
