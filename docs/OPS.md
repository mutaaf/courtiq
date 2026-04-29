# Operations runbook

Short, blunt notes for things ops needs to do without rediscovering them every
quarter. Update this file whenever you touch a billing-adjacent system.

---

## Stripe webhook secret rotation

Stripe rotates webhook signing secrets ~quarterly (or after a security
incident). A botched rotation manifests as silent billing failures — the
handler returns 400 "Invalid signature" and Stripe stops retrying after a few
attempts, so checkout-completed events get dropped and tier upgrades never
land.

The handler at `src/app/api/stripe/webhook/route.ts` reads
`STRIPE_WEBHOOK_SECRET`. Optional fallback: `STRIPE_WEBHOOK_SECRET_SECONDARY`
— if set, the handler will verify against either. Use this for zero-downtime
rotation:

```
1. Generate the new secret in Stripe Dashboard → Developers → Webhooks →
   <your endpoint> → "Roll secret".
2. Add the new value as STRIPE_WEBHOOK_SECRET_SECONDARY in your env (Vercel
   Production → Environment Variables).
3. Deploy. Both old and new secrets verify; no traffic is lost.
4. Wait ≥48h. Stripe stops sending events with the old secret within minutes,
   but waiting catches any retries.
5. Promote: rename STRIPE_WEBHOOK_SECRET_SECONDARY → STRIPE_WEBHOOK_SECRET.
   Remove the secondary. Deploy.
```

If you need to rotate emergency-fast (compromised secret), invert the order:
swap the primary first, then back-fill the secondary so old in-flight events
still verify until they drop off.

To monitor: tail the `stripe_webhook_events` table for rows with
`status = 'failed'` and message containing "Invalid signature".

---

## ⚠️ Vercel env vars — never use `echo "..." | vercel env add`

`echo` appends `\n`. Node's HTTP layer rejects `\n` in header values
(ERR_INVALID_CHAR), and Stripe surfaces that as `StripeConnectionError:
"Request was retried 2 times."` — which spent us an hour debugging.

Always write to a tempfile with `printf %s` first, then redirect stdin:

```bash
printf %s "$VALUE" > /tmp/v.txt
vercel env add MY_KEY production < /tmp/v.txt
rm /tmp/v.txt
```

Or use the dashboard / `scripts/stripe-go-live.js --push-vercel`, which
already handles this correctly.

## Going live (test mode → live mode)

1. **Stripe**: switch dashboard to **Live mode**. Re-create:
   - Webhook endpoint → copy new signing secret into `STRIPE_WEBHOOK_SECRET`.
   - Products + prices for each tier × interval. Copy the 6 `price_...` IDs
     into `STRIPE_PRICE_*_MONTHLY` / `_ANNUAL`.
   - Customer Portal config: enable plan switching, cancellation, payment
     method updates, invoice history.
2. **Env vars** (Vercel Production):
   - `STRIPE_SECRET_KEY` → `sk_live_...`
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` → `pk_live_...`
   - `STRIPE_WEBHOOK_SECRET` → from the live webhook
   - 6 × `STRIPE_PRICE_*` → live price IDs
   - `STRIPE_TRIAL_DAYS` → confirm value (default 14 if unset)
3. **Stripe Tax**: Dashboard → Tax → enable for the live account. The code
   already passes `automatic_tax: { enabled: true }`; this is a no-op until
   the account is configured. Add a tax registration for any state where you
   have nexus.
4. **Smoke test**: run `node scripts/stripe-smoke.js` against test mode one
   last time, then sign up a real account end-to-end with a real card on a
   throwaway email; cancel from the portal; confirm `customer.subscription.
   deleted` fires and tier flips to `free`.
5. **Don't** run `scripts/stripe-smoke.js` against live keys — it explicitly
   refuses, but verify by reading the prefix-check.

---

## Tier downgrade behavior

When a paid coach with N teams cancels and the tier drops to `free`
(`maxTeams: 1`), the webhook handler archives the excess teams via
`teams.archived_at`:

- `teams.archived_at IS NULL` → live, writeable.
- `teams.archived_at IS NOT NULL` → read-only. The dashboard shows them in
  the team picker with an "Archived — upgrade to reactivate" badge. Writes
  via `/api/data/mutate` return 402 with `archived: true`.
- The most recently created team stays live (assumed current focus).
- No automatic hard-delete; archived teams persist indefinitely until the
  coach reactivates by upgrading or manually purges.

If you need to manually unarchive:
```
UPDATE teams SET archived_at = NULL WHERE id = '...';
```

---

## AI quota

`TIER_LIMITS[tier].maxAICallsPerMonth` is the cap (5 for free, effectively
unlimited for paid). Counted as successful rows in `ai_interactions` for the
calling coach in the current calendar month.

Enforcement lives in `src/lib/ai/quota.ts` (`enforceAIQuota`), called both
by the AI client wrapper (`callAI`) and by direct-vision endpoints like
`/api/ai/import-roster`. When changing the cap, only that table needs to
update — the runtime reads the limit dynamically.
