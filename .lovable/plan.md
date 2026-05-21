
# Marketing Campaigns (Resend)

A full marketing email system that lives alongside the existing transactional emails, with its own contact list, branded HTML builder, preview/edit, draft/schedule/send, and compliance (unsubscribe, suppression, CAN-SPAM footer).

## 1. Email infrastructure (Resend)

**Sender:** `Aquatic Dreams <info@aquaticdreamsswim.com>` (your choice).

> ⚠️ Recommendation: use `info@news.aquaticdreamsswim.com` instead. Same display name in the inbox, but isolates marketing reputation from waivers and receipts. We can switch by changing one env var later — I'll build it so the sender is configurable.

**Setup steps (you do these once):**
1. Add the domain in Resend → get 4 DNS records (MX, SPF, DKIM, DMARC).
2. Add those records in **Project Settings → Domains → ⋯ → Configure → Manage DNS records**.
3. When verified, I'll link the **Resend connector** (you'll pick the API key in a one-click flow).
4. I'll set a secret `MARKETING_FROM_ADDRESS = "Aquatic Dreams <info@aquaticdreamsswim.com>"`.

## 2. Database

New tables:

- `marketing_contacts` — `email` (unique), `first_name`, `last_name`, `phone`, `source` (swim/lessons/dive/contact/import/manual), `tags` (text[]), `subscribed`, `unsubscribed_at`, `last_sent_at`, timestamps.
- `marketing_campaigns` — `name`, `subject`, `preheader`, `from_address`, `body_html`, `body_blocks` (jsonb for the structured builder), `status` (draft/scheduled/sending/sent/failed/cancelled), `audience` (jsonb filter: tags, sources, custom), `scheduled_for`, `sent_at`, `sent_count`, `created_by`, timestamps.
- `marketing_campaign_recipients` — per-recipient ledger: `campaign_id`, `contact_id`, `email`, `status` (queued/sent/failed/bounced/complained/opened/clicked), `resend_message_id`, `error`, `sent_at`, `opened_at`, `clicked_at`.
- `marketing_unsubscribe_tokens` — one stable token per email for one-click unsubscribe.

**RLS:** Admin-only for all four tables. Public unsubscribe page reads/writes via a SECURITY DEFINER RPC by token.

**Auto-sync triggers** (your "Master list + auto-tags" choice):
- New row in `swim_enrollments` → upsert contact, add tag `swim`, plus a level tag (`level:white` etc.).
- New row in `lesson_bookings` → upsert contact, add tag `private-lessons`.
- New row in `dive_bookings` → upsert contact, add tag `scuba`.
- New row in `contact_submissions` → upsert contact, add tag `inquiry`.
- Initial backfill of all four sources runs once at migration time.

Tags are append-only via trigger — existing contacts gain new tags without losing old ones.

## 3. Edge functions

- `send-marketing-campaign` — sends a campaign now. Resolves audience → de-dupes against `suppressed_emails` + `unsubscribed_at` → batches to Resend gateway (50/req, throttled to stay under rate limits) → writes per-recipient rows → updates campaign status.
- `schedule-marketing-campaigns` — cron job (every minute) that picks up `status='scheduled' AND scheduled_for <= now()` and dispatches them.
- `resend-webhook` — receives Resend webhook events (delivered/opened/clicked/bounced/complained), updates `marketing_campaign_recipients`, and adds hard bounces + complaints to `suppressed_emails`.
- `marketing-unsubscribe` — public endpoint that takes a token, marks the contact `subscribed=false`, and shows a success page.
- `preview-marketing-campaign` — renders the campaign HTML server-side so the admin preview matches what recipients see exactly (same shared layout/tokens as transactional emails).

Cron job is created via `supabase--insert` (not migration) since it includes the project URL + anon key.

## 4. Branded HTML template

A new shared template `_shared/marketing-templates/campaign.tsx` reusing the maritime palette and typography from the existing transactional emails. Structured blocks:

- Header w/ logo
- Hero (image + headline + subhead)
- Rich-text body
- CTA button(s)
- Image card row (1–3 cards, optional)
- Footer with address, "why you're getting this", and one-click unsubscribe

The builder UI stores `body_blocks` (jsonb) so non-technical edits stay non-technical, and the renderer produces email-safe HTML on the server.

## 5. Admin UI (`/admin/marketing`)

Sidebar entry: **Marketing**. Three tabs:

**Campaigns**
- Table: name, status badge, audience size, scheduled/sent at, open rate.
- Buttons: New campaign, Duplicate, Delete (draft only).
- Detail page = builder + preview pane side-by-side.
  - Left: name, subject, preheader, audience picker (tag chips + source filter + live recipient count), block editor.
  - Right: live HTML preview (iframe, like `EmailPreviewDialog`).
  - Bottom actions: **Save Draft**, **Schedule…** (date/time picker), **Send Now**, **Send test to me**, **Delete**.
- After send: per-recipient table with delivered/opened/bounced.

**Contacts**
- Table with search, source filter, tag filter, subscribed toggle.
- Actions: Add contact, Import CSV (Dive 360 export), Bulk tag, Bulk unsubscribe, Export.
- Per-contact drawer: history of campaigns received + opens/clicks.

**Settings**
- From address, reply-to, physical mailing address (required for CAN-SPAM), default footer text.
- Suppression list view (read-only; entries added automatically).

## 6. Compliance

- Every campaign auto-includes physical address + one-click unsubscribe in the footer.
- `List-Unsubscribe` and `List-Unsubscribe-Post` headers set on every send (Gmail/Yahoo bulk-sender requirement).
- Send pipeline always filters out: `unsubscribed_at IS NOT NULL`, address in `suppressed_emails`, address with prior hard bounce or complaint.
- Public `/unsubscribe/:token` page (separate from the existing transactional unsubscribe so we can show marketing-specific copy).

## 7. Build order

1. Migration: 4 tables + RLS + triggers + backfill.
2. Resend connector + `MARKETING_FROM_ADDRESS` secret (after your DNS verifies).
3. Edge functions (send, schedule cron, webhook, unsubscribe, preview).
4. Shared marketing email template.
5. Admin UI: Contacts tab.
6. Admin UI: Campaigns tab + builder + preview.
7. Public unsubscribe page.
8. Settings tab + suppression view.
9. End-to-end test: create campaign → preview → send test → schedule → real send to a 2-contact tag.

## Out of scope (for now)
- A/B testing, drip sequences/automations, SMS, link-shortened click tracking dashboards beyond raw counts. Easy to add later on top of this foundation.

---

**Next action for you:** add the domain in Resend, paste the DNS records into Lovable's DNS manager. Ping me when Resend shows "Verified" and I'll start with the database migration and connector link.
