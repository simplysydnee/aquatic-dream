## Plan

**1. Fix logo in marketing emails**
- `supabase/functions/send-marketing-campaign/index.ts`: pass `logoUrl` (public `email-assets/aqd-email-logo.jpg`) into `renderMarketingHtml` so the logo loads at the top.
- `supabase/functions/preview-marketing-campaign/index.ts`: default the same logo when caller doesn't supply one.

**2. Seed U14 inquirers as marketing contacts**
- Upsert all `lesson_requests` where `child_age < 14` AND `is_adult_swimmer = false` into `marketing_contacts` via the existing `upsert_marketing_contact` RPC, adding tag `private-lesson-inquiry-u14`. ~61 contacts.

**3. Create the campaign**
- Insert a `marketing_campaigns` draft:
  - Subject: "Private swim lessons are open — book your spot"
  - Preheader: "Flexible 1-on-1 and semi-private lessons with our certified instructors."
  - Blocks: heading → friendly body → **Button "Book a Private Lesson" → https://aquaticdreamsswim.com/book-private-lesson** → short text about $65/lesson + 24-hr cancellation.
  - Audience: `{ tags: ["private-lesson-inquiry-u14"], sources: [], include_all: false }`

**4. Send**
- Invoke `send-marketing-campaign` with the new campaign_id. Unsubscribed/suppressed addresses are auto-skipped.
- Report sent/failed counts.

### Files / changes
- edit: `supabase/functions/send-marketing-campaign/index.ts`
- edit: `supabase/functions/preview-marketing-campaign/index.ts`
- DB inserts: marketing_contacts seed + campaign row
- Edge function invocation: send-marketing-campaign
